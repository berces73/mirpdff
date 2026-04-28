// ============================================================
// src/jobs.js — Upload → Dispatch → Status → Result → Cleanup
// ============================================================

import { json, rateLimit, timingSafeEq, toolMaxMb, getContentLength, TOOL_COSTS, TOOL_ENDPOINT, DEFAULT_JOB_TTL_SECONDS } from "./helpers.js";
import { getClientId, creditDO } from "./clientid.js";
import { createDownloadToken, verifyDownloadToken } from "./download.js";
import { completeAbuseCheck } from "./ratelimit.js";

function fileExtension(name, fallback = "pdf") {
  const match = String(name || "").match(/\.([a-z0-9]{1,10})$/i);
  return match ? match[1].toLowerCase() : fallback;
}

function outputExtensionForTool(tool, options = {}) {
  if (tool === "pdf-to-word") return options.format === "odt" ? "odt" : "docx";
  return "pdf";
}

function outputContentTypeForTool(tool, options = {}) {
  if (tool === "pdf-to-word") {
    return options.format === "odt"
      ? "application/vnd.oasis.opendocument.text"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/pdf";
}

function inputFallbackExtension(tool) {
  if (tool === "jpg-to-pdf") return "jpg";
  if (tool === "word-to-pdf") return "docx";
  if (tool === "excel-to-pdf") return "xlsx";
  if (tool === "ppt-to-pdf") return "pptx";
  return "pdf";
}

function inputContentTypeForUpload(file, tool) {
  if (file?.type) return file.type;
  if (tool === "jpg-to-pdf") return "image/jpeg";
  if (tool === "word-to-pdf") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (tool === "excel-to-pdf") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (tool === "ppt-to-pdf") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/pdf";
}

function downloadFilenameFromKey(key, fallback = "download.bin") {
  const raw = String(key || "").split("/").pop() || fallback;
  return raw.replace(/[^A-Za-z0-9._-]/g, "_");
}

function contentTypeFromFilename(name) {
  const ext = fileExtension(name, "bin");
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "odt") return "application/vnd.oasis.opendocument.text";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

// ---- Circuit breaker (CIRCUIT_KV) ----
// KV TOCTOU notu: circuitRecordFailure'da get→compute→put race mevcut.
// Önlem: failCount'u yeterince yüksek tutarak (5) tek race'in etkisi minimize edildi.
// OPEN durumuna geçiş için birden fazla eşzamanlı hata gerekir — gerçek hata
// döneminde bu zaten gerçekleşir; yanlış OPEN riski ihmal edilebilir.
async function getCircuitState(env) {
  try {
    if (!env?.CIRCUIT_KV) return { state: "CLOSED" };
    const raw = await env.CIRCUIT_KV.get("circuit_state");
    if (!raw) return { state: "CLOSED", openedAt: 0, failCount: 0 };
    const st = JSON.parse(raw);
    if (st.state === "OPEN" && Date.now() - st.openedAt > 60_000) {
      st.state = "HALF_OPEN";
      st.failCount = 0;
      await env.CIRCUIT_KV.put("circuit_state", JSON.stringify(st), { expirationTtl: 3600 });
    }
    return st;
  } catch {
    return { state: "CLOSED" };
  }
}

export async function circuitRecordSuccess(env) {
  try {
    if (!env?.CIRCUIT_KV) return;
    await env.CIRCUIT_KV.put("circuit_state",
      JSON.stringify({ state: "CLOSED", openedAt: 0, failCount: 0 }),
      { expirationTtl: 3600 }
    );
  } catch {}
}

export async function circuitRecordFailure(env) {
  try {
    if (!env?.CIRCUIT_KV) return;
    const raw = await env.CIRCUIT_KV.get("circuit_state");
    const st  = raw ? JSON.parse(raw) : { state: "CLOSED", openedAt: 0, failCount: 0 };
    // OPEN veya HALF_OPEN iken tekrar failure → OPEN'da kal, openedAt'i yenile
    if (st.state === "OPEN") {
      st.openedAt = Date.now(); // backoff süresini uzat
      await env.CIRCUIT_KV.put("circuit_state", JSON.stringify(st), { expirationTtl: 3600 });
      return;
    }
    st.failCount = (st.failCount || 0) + 1;
    // Eşik: 5 hata → OPEN. Race durumunda sayaç 2x atlayabilir — kabul edilebilir,
    // zaten hata durumundayız ve circuit'in açılması gecikse bile monitoring yakalar.
    if (st.failCount >= 5) {
      st.state    = "OPEN";
      st.openedAt = Date.now();
    }
    await env.CIRCUIT_KV.put("circuit_state", JSON.stringify(st), { expirationTtl: 3600 });
  } catch {}
}

// ---- edgeCachePublicGET (imported by handleJobResult) ----
// Defined in _worker.js scope still; passed as argument to avoid circular dependency

// ---- Tool upload + job create ----
export async function handleToolUpload(request, env, ctx, { tool, mapOptions }) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "0.0.0.0";
  // getClientId tek seferde çağrılır — hem RL hem de işlem için aynı sonuç kullanılır
  const { clientId, setCookie } = await getClientId(request, env);
  const upLimit = Number(env.RL_UPLOAD_PER_MINUTE || "12");
  const rlUp1 = await rateLimit(env, `up:ip:${ip}`, upLimit, 60);
  if (!rlUp1.ok) return json({ ok: false, error: "RATE_LIMITED", retryAfter: rlUp1.retryAfter }, 429, env);
  const rlUp2 = await rateLimit(env, `up:cid:${clientId}`, upLimit, 60);
  if (!rlUp2.ok) return json({ ok: false, error: "RATE_LIMITED", retryAfter: rlUp2.retryAfter }, 429, env);

  const maxMb = toolMaxMb(env, tool);
  const maxBytes = Math.max(1, maxMb) * 1024 * 1024;

  const cl = getContentLength(request);
  if (cl !== null && cl > maxBytes) return json({ ok: false, error: "PAYLOAD_TOO_LARGE", maxMb }, 413, env);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "MISSING_FILE" }, 400, env);
  if (file.size > maxBytes) return json({ ok: false, error: "FILE_TOO_LARGE", maxMb }, 413, env);

  // K7: Magic bytes validation
  {
    const headerBuf = await file.slice(0, 8).arrayBuffer();
    const hdr = new Uint8Array(headerBuf);
    const matches = (magic) => magic.every((b, i) => hdr[i] === b);
    const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2D];
    const JPG_MAGIC = [0xFF, 0xD8, 0xFF];
    const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    const PDF_TOOLS = ["compress-strong", "pdf-to-word", "ocr", "pdf-split", "pdf-merge",
      "pdf-rotate", "pdf-delete-page", "pdf-sort", "pdf-lock", "pdf-unlock",
      "pdf-watermark", "pdf-sign", "pdf-edit", "pdf-to-jpg", "pdf-qr"];
    const IMG_TOOLS = ["jpg-to-pdf"];
    if (PDF_TOOLS.includes(tool)) {
      if (!matches(PDF_MAGIC)) return json({ ok: false, error: "INVALID_FILE_TYPE", message: "Yalnızca gerçek PDF dosyaları kabul edilir (%PDF- imzası gerekli)." }, 415, env);
      if (file.size < 100) return json({ ok: false, error: "FILE_TOO_SMALL", message: "PDF dosyası çok küçük." }, 400, env);
    } else if (IMG_TOOLS.includes(tool)) {
      if (!matches(JPG_MAGIC) && !matches(PNG_MAGIC)) return json({ ok: false, error: "INVALID_FILE_TYPE", message: "Yalnızca JPG veya PNG dosyaları kabul edilir." }, 415, env);
    }
  }

  const opId = String(form.get("opId") || "").trim() || null;
  const options = mapOptions(form, file) || {};
  if (!options.filename && file.name) options.filename = file.name;
  if (!options.mimeType && file.type) options.mimeType = file.type;
  const dObj = creditDO(env, clientId);
  const cost = TOOL_COSTS[tool] || 1;

  if (opId) {
    const lockRes = await dObj.fetch("https://do/lock-op", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ opId, ttlMs: 10 * 60_000 }),
    });
    const lockJson = await lockRes.json().catch(() => ({}));
    if (!lockRes.ok || !lockJson.ok) {
      return json({ ok: false, error: "OP_LOCK_FAILED", message: lockJson.error || "locked" }, 409, env, setCookie ? { "set-cookie": setCookie } : {});
    }
  }

  const consumeRes = await dObj.fetch("https://do/consume", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, cost, opId }),
  });
  const consumeJson = await consumeRes.json().catch(() => ({}));
  if (!consumeRes.ok || !consumeJson.ok) {
    if (opId) ctx.waitUntil(dObj.fetch("https://do/finalize-op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opId, ok: false }) }));
    return json({ ok: false, error: "NO_CREDITS", message: consumeJson.error || "insufficient credits" }, 402, env, setCookie ? { "set-cookie": setCookie } : {});
  }

  const jobId = crypto.randomUUID();
  const inputExt = fileExtension(file.name, inputFallbackExtension(tool));
  const outputExt = outputExtensionForTool(tool, options);
  const inputKey = `jobs/${jobId}/input.${inputExt}`;
  const outputKey = `jobs/${jobId}/output.${outputExt}`;

  await env.PDF_R2.put(inputKey, file.stream(), {
    httpMetadata: { contentType: inputContentTypeForUpload(file, tool) },
    customMetadata: { jobId, tool, clientId, filename: file.name || "input.pdf" },
  });

  const ttl = Number(env.JOB_TTL_SECONDS || DEFAULT_JOB_TTL_SECONDS);
  try {
    await env.DB.prepare(
      `INSERT INTO jobs (job_id, tool, status, input_key, output_key, created_at, updated_at, client_id, ttl_seconds, cost, op_id, expires_at)
       VALUES (?1, ?2, 'pending', ?3, ?4, unixepoch(), unixepoch(), ?5, ?6, ?7, ?8, unixepoch() + ?6)`
    ).bind(jobId, tool, inputKey, outputKey, clientId, ttl, cost, opId).run();
  } catch (dbErr) {
    // DB başarısız → R2 orphan oluşmasını önle + krediyi iade et
    await env.PDF_R2.delete(inputKey).catch(() => {});
    ctx.waitUntil(dObj.fetch("https://do/refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool, cost, jobId }) }));
    if (opId) ctx.waitUntil(dObj.fetch("https://do/finalize-op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opId, ok: false }) }));
    return json({ ok: false, error: "DB_ERROR", message: "İş oluşturulamadı, lütfen tekrar deneyin." }, 500, env, setCookie ? { "set-cookie": setCookie } : {});
  }

  const processorPath = TOOL_ENDPOINT[tool];

  if (env?.JOB_QUEUE && String(env.QUEUE_MODE || "").toLowerCase() === "on") {
    await env.JOB_QUEUE.send({ jobId, tool, inputKey, outputKey, options, processorPath, clientId, cost, opId });
  } else {
    ctx.waitUntil(dispatchToProcessor(env, { jobId, tool, inputKey, outputKey, options, processorPath, clientId, cost, opId }));
  }

  return json(
    { ok: true, data: { jobId, status: "pending", pollUrl: `/api/jobs/${jobId}/status`, resultUrl: `/api/jobs/${jobId}/result` } },
    202, env, setCookie ? { "set-cookie": setCookie } : {}
  );
}

// ---- Dispatch to VPS processor ----
async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function dispatchToProcessor(env, { jobId, tool, inputKey, outputKey, options, processorPath, clientId, cost, opId }) {
  const cb = await getCircuitState(env);
  if (cb.state === "OPEN") {
    // Devre açık — job başlatılamaz, krediyi iade et ve job'u failed işaretle
    const errMsg = "Servis geçici olarak kullanılamıyor (devre koruyucu aktif). Lütfen birkaç dakika sonra tekrar deneyin.";
    try { await env.DB.prepare("UPDATE jobs SET status='failed', error_message=?2, updated_at=unixepoch() WHERE job_id=?1").bind(jobId, errMsg).run(); } catch {}
    try {
      const dObj = creditDO(env, clientId);
      await dObj.fetch("https://do/refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool, cost, jobId }) });
    } catch {}
    if (opId) {
      try {
        const dObj = creditDO(env, clientId);
        await dObj.fetch("https://do/finalize-op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opId, ok: false }) });
      } catch {}
    }
    return;
  }

  const processorUrl = env.PROCESSOR_URL;
  const secret = env.PROCESSOR_SECRET;

  // ── Guard: PROCESSOR_URL veya SECRET eksikse job'u failed olarak işaretle,
  //    krediyi iade et. Exception fırlatma — Worker crash'ini önler.
  if (!processorUrl || processorUrl.startsWith("REQUIRED_SET_") || processorUrl.includes("FILL_PROCESSOR_IP")) {
    const errMsg = !processorUrl
      ? "Yapılandırma hatası: PROCESSOR_URL tanımlanmamış."
      : "Yapılandırma hatası: PROCESSOR_URL henüz ayarlanmamış (placeholder değer).";
    try { await env.DB.prepare("UPDATE jobs SET status='failed', error_message=?2, updated_at=unixepoch() WHERE job_id=?1").bind(jobId, errMsg).run(); } catch {}
    try {
      const dObj = creditDO(env, clientId);
      await dObj.fetch("https://do/refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool, cost, jobId }) });
    } catch {}
    if (opId) {
      try {
        const dObj = creditDO(env, clientId);
        await dObj.fetch("https://do/finalize-op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opId, ok: false }) });
      } catch {}
    }
    return; // throw değil — graceful exit
  }

  if (!secret) {
    const errMsg = "Yapılandırma hatası: PROCESSOR_SECRET tanımlanmamış.";
    try { await env.DB.prepare("UPDATE jobs SET status='failed', error_message=?2, updated_at=unixepoch() WHERE job_id=?1").bind(jobId, errMsg).run(); } catch {}
    try {
      const dObj = creditDO(env, clientId);
      await dObj.fetch("https://do/refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool, cost, jobId }) });
    } catch {}
    if (opId) {
      try {
        const dObj = creditDO(env, clientId);
        await dObj.fetch("https://do/finalize-op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opId, ok: false }) });
      } catch {}
    }
    return; // throw değil — graceful exit
  }

  await env.DB.prepare("UPDATE jobs SET status='running', updated_at=unixepoch() WHERE job_id=?1").bind(jobId).run();

  const maxAttempts = 3;
  const baseDelayMs = 200;   // 350→200ms: toplam bekleme süresi azaltıldı
  const timeoutMs   = 9_000; // 12s→9s: 3 deneme × 9s = 27s < 30s Worker CPU limiti
  // Toplam worst-case: 9s + 200ms + 9s + 600ms + 9s = ~27.8s (free plan 30s altında)

  async function fetchWithTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort("timeout"), ms);
    try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
    finally { clearTimeout(t); }
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const payload = { jobId, inputKey, outputKey, tool, options };
      const resp = await fetchWithTimeout(`${processorUrl}${processorPath}`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${secret}` },
        body: JSON.stringify(payload),
      }, timeoutMs);

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`processor_http_${resp.status}: ${txt.slice(0, 300)}`);
      }

      if (opId) {
        try {
          const dObj = creditDO(env, clientId);
          await dObj.fetch("https://do/finalize-op", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ opId, ok: true, jobId }),
          });
        } catch {}
      }
      await circuitRecordSuccess(env);
      return;
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || "");
      const isTimeout = msg.includes("timeout") || err?.name === "AbortError";
      const isNetwork = msg.includes("NetworkError") || msg.includes("fetch") || msg.includes("ECONN") || msg.includes("ENOTFOUND");
      const is5xx = msg.includes("processor_http_5");
      if (attempt < maxAttempts && (isTimeout || isNetwork || is5xx)) {
        await sleep(baseDelayMs * Math.pow(3, attempt - 1));
      } else {
        break;
      }
    }
  }

  // Failure path: mark failed + refund
  try { await env.DB.prepare("UPDATE jobs SET status='failed', error_message=?2, updated_at=unixepoch() WHERE job_id=?1").bind(jobId, "GEÇİCİ_HATA: Processor erişilemedi. Lütfen biraz sonra tekrar deneyin.").run(); } catch {}
  try {
    const dObj = creditDO(env, clientId);
    await dObj.fetch("https://do/refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool, cost, jobId }) });
  } catch {}
  if (opId) {
    try {
      const dObj = creditDO(env, clientId);
      await dObj.fetch("https://do/finalize-op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opId, ok: false }) });
    } catch {}
  }
  await circuitRecordFailure(env);
  throw lastErr || new Error("processor_dispatch_failed");
}

// ---- Processor callback ----
export async function handleProcessorCallback(request, env) {
  const auth = (request.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!timingSafeEq(auth, env.PROCESSOR_SECRET || "")) return json({ ok: false, error: "UNAUTHORIZED" }, 401, env);

  const body = await request.json().catch(() => null);
  if (!body || !body.jobId) return json({ ok: false, error: "BAD_JSON" }, 400, env);

  const jobId = String(body.jobId);
  const status = String(body.status || "");

  if (status === "done") {
    await env.DB.prepare("UPDATE jobs SET status='done', output_key=?2, output_bytes=?3, updated_at=unixepoch() WHERE job_id=?1")
      .bind(jobId, String(body.outputKey || ""), Number(body.outputBytes || 0)).run();
  } else if (status === "failed") {
    const job = await env.DB.prepare("SELECT client_id, tool, cost FROM jobs WHERE job_id=?1")
      .bind(jobId).first().catch(() => null);
    await env.DB.prepare("UPDATE jobs SET status='failed', error_message=?2, updated_at=unixepoch() WHERE job_id=?1")
      .bind(jobId, String(body.errorMessage || "failed").slice(0, 500)).run();
    if (job?.client_id) {
      try {
        const dObj = creditDO(env, String(job.client_id));
        await dObj.fetch("https://do/refund", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tool: String(job.tool || ""), cost: Number(job.cost || 1), jobId }),
        });
      } catch {}
    }
  } else {
    return json({ ok: false, error: "BAD_STATUS" }, 400, env);
  }
  return json({ ok: true }, 200, env);
}

// ---- Job status ----
export async function handleJobStatus(request, env, jobId) {
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const { clientId, setCookie } = await getClientId(request, env);
  const pollLimit = Number(env.RL_POLL_PER_MINUTE || "60");
  const rlP1 = await rateLimit(env, `poll:ip:${ip}`, pollLimit, 60);
  if (!rlP1.ok) return json({ ok: false, error: "RATE_LIMITED", retryAfter: rlP1.retryAfter }, 429, env);
  const rlP2 = await rateLimit(env, `poll:cid:${clientId}`, pollLimit, 60);
  if (!rlP2.ok) return json({ ok: false, error: "RATE_LIMITED", retryAfter: rlP2.retryAfter }, 429, env);

  const row = await env.DB.prepare(
    "SELECT job_id, tool, status, input_key, output_key, output_bytes, error_message, client_id, cost, op_id, created_at, updated_at FROM jobs WHERE job_id=?1 AND client_id=?2"
  ).bind(jobId, clientId).first();
  if (!row) return json({ ok: false, error: "NOT_FOUND" }, 404, env, setCookie ? { "set-cookie": setCookie } : undefined);

  let download_url = null;
  if (row.status === "done" && row.output_key) {
    try {
      // exp saate yuvarlanır: aynı saat içindeki tüm poll'lar aynı token'ı alır
      // → CF edge cache download_url'yi önbelleğe alabilir (importKey maliyeti azalır)
      const nowSec = Math.floor(Date.now() / 1000);
      const exp = (Math.floor(nowSec / 3600) + 1) * 3600; // bir sonraki tam saat
      const t = await createDownloadToken(env, { jobId: row.job_id, clientId, exp });
      download_url = `/api/jobs/${encodeURIComponent(row.job_id)}/result?t=${encodeURIComponent(t)}`;
    } catch {
      download_url = `/api/jobs/${encodeURIComponent(row.job_id)}/result`;
    }
  }

  return json({ ok: true, data: { ...row, download_url } }, 200, env, setCookie ? { "set-cookie": setCookie } : undefined);
}

// ---- Job result (R2 file delivery) ----
export async function handleJobResult(request, env, ctx, jobId, edgeCachePublicGET, corsHeaders) {
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const url = new URL(request.url);
  const token = url.searchParams.get("t");

  const { clientId: rlClientId } = await getClientId(request, env);
  const pollLimit = Number(env.RL_POLL_PER_MINUTE || "60");
  const rlR1 = await rateLimit(env, `poll:ip:${ip}`, pollLimit, 60);
  if (!rlR1.ok) return json({ ok: false, error: "RATE_LIMITED", retryAfter: rlR1.retryAfter }, 429, env);
  const rlR2 = await rateLimit(env, `poll:cid:${rlClientId}`, pollLimit, 60);
  if (!rlR2.ok) return json({ ok: false, error: "RATE_LIMITED", retryAfter: rlR2.retryAfter }, 429, env);

  // token varsa verifyDownloadToken'dan clientId al, yoksa rlClientId'yi yeniden kullan
  let clientId = null;
  if (token) {
    const v = await verifyDownloadToken(env, { jobId, token });
    if (!v.ok) return json({ ok: false, error: "INVALID_TOKEN" }, 403, env);
    clientId = v.clientId;
  } else {
    clientId = rlClientId;
  }

  const row = await env.DB.prepare("SELECT status, output_key FROM jobs WHERE job_id=?1 AND client_id=?2")
    .bind(jobId, clientId).first();
  if (!row) return json({ ok: false, error: "NOT_FOUND" }, 404, env);
  if (row.status !== "done") return json({ ok: false, error: "NOT_READY", status: row.status }, 409, env);

  const fetchFromR2 = async () => {
    const obj = await env.PDF_R2.get(row.output_key);
    if (!obj) return json({ ok: false, error: "OUTPUT_NOT_FOUND" }, 404, env);
    const headers = new Headers(corsHeaders(env));
    obj.writeHttpMetadata(headers);
    const downloadName = downloadFilenameFromKey(row.output_key);
    headers.set("content-disposition", `attachment; filename="${downloadName}"`);
    if (!headers.get("content-type")) headers.set("content-type", contentTypeFromFilename(downloadName));
    headers.set("etag", obj.httpEtag);
    headers.set("cache-control", token
      ? "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400"
      : "no-store"
    );
    return new Response(obj.body, { headers });
  };

  if (token) return await edgeCachePublicGET(request, env, ctx, { ttl: 3600, swr: 86400 }, fetchFromR2);
  return fetchFromR2();
}

// ---- Cleanup (cron) ----
export async function runCleanup(env) {
  const ttlDefault = Number(env.JOB_TTL_SECONDS || DEFAULT_JOB_TTL_SECONDS);
  const extraGrace = Number(env.CLEANUP_GRACE_SECONDS || "600");
  const cutoff = Math.floor(Date.now() / 1000) - (ttlDefault + extraGrace);
  const limit = Math.min(Math.max(Number(env.CLEANUP_BATCH || "50"), 1), 200);

  const { results } = await env.DB.prepare(
    // created_at + ttl_seconds: her job kendi TTL'ine göre temizlenir
    // updated_at < cutoff ile birlikte AND — ikisi de geçmişse sil
    "SELECT job_id, client_id, tool, cost, status FROM jobs WHERE (created_at + ttl_seconds) < unixepoch() AND updated_at < ?1 LIMIT ?2"
  ).bind(cutoff, limit).all();

  const nowMs = Date.now();
  try {
    await env.DB.prepare("DELETE FROM email_tokens WHERE expires_at < ?1").bind(nowMs).run();
    await env.DB.prepare("DELETE FROM password_resets WHERE expires_at < ?1 OR used_at IS NOT NULL").bind(nowMs).run();
    await env.DB.prepare("DELETE FROM refresh_tokens WHERE expires_at < ?1 OR revoked_at IS NOT NULL").bind(nowMs).run();
  } catch {}

  // Büyüme riski taşıyan tablolar — retention politikasıyla temizle
  const retentionDays = Number(env.ANALYTICS_RETENTION_DAYS || "90");
  const retentionCutoff = nowMs - retentionDays * 24 * 3600 * 1000;
  try {
    // analytics_events: 90 gün (env ile ayarlanabilir)
    await env.DB.prepare(
      "DELETE FROM analytics_events WHERE created_at < ?1 LIMIT 500"
    ).bind(new Date(retentionCutoff).toISOString()).run();
  } catch {}
  try {
    // monitoring_events: 30 gün — uyarılar eskidikçe anlamsız
    const monCutoff = nowMs - 30 * 24 * 3600 * 1000;
    await env.DB.prepare(
      "DELETE FROM monitoring_events WHERE created_at < ?1 LIMIT 200"
    ).bind(new Date(monCutoff).toISOString()).run();
  } catch {}
  try {
    // webhook_failures: 60 gün — created_at is TEXT ISO
    const whCutoff = nowMs - 60 * 24 * 3600 * 1000;
    await env.DB.prepare(
      "DELETE FROM webhook_failures WHERE created_at < ?1 LIMIT 200"
    ).bind(new Date(whCutoff).toISOString()).run();
  } catch {}
  try {
    // attribution_sessions: 90 gün
    await env.DB.prepare(
      "DELETE FROM attribution_sessions WHERE last_seen_at < ?1 LIMIT 300"
    ).bind(retentionCutoff).run();
  } catch {}

  if (!results || results.length === 0) return;

  const jobIds = results.map(r => r.job_id);

  // Stuck pending/running job'ları için kredi iade et (kullanıcı parasını kaybetmesin)
  for (const job of results) {
    if ((job.status === "pending" || job.status === "running") && job.client_id && job.cost > 0) {
      try {
        const dObj = creditDO(env, String(job.client_id));
        await dObj.fetch("https://do/refund", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tool: String(job.tool || ""), cost: Number(job.cost), jobId: job.job_id }),
        });
      } catch {}
    }
  }

  // Tek sorguda toplu sil (N ayrı DELETE yerine)
  const placeholders = jobIds.map((_, i) => `?${i + 1}`).join(",");
  await env.DB.prepare(`DELETE FROM jobs WHERE job_id IN (${placeholders})`)
    .bind(...jobIds).run().catch(() => {});

  // R2 nesnelerini temizle (her job kendi prefix'inde)
  for (const jobId of jobIds) {
    try {
      let cursor = undefined;
      for (let i = 0; i < 10; i++) {
        const listed = await env.PDF_R2.list({ prefix: `jobs/${jobId}/`, cursor, limit: 1000 });
        if (listed.objects.length) await env.PDF_R2.delete(listed.objects.map(o => o.key));
        if (!listed.truncated) break;
        cursor = listed.cursor;
      }
    } catch {}
  }
}

// ---- Job submit (JSON body, no file upload — processor pre-fetches from R2) ----
export async function handleJobSubmit(request, env, ctx) {
  const abuse = await completeAbuseCheck(env, request, { action: "upload", requireTurnstile: false });
  if (!abuse.allowed)
    return json({ ok: false, error: "RATE_LIMIT", reason: abuse.reason, retryAfter: abuse.retryAfter }, 429, env);

  const cl = request.headers.get("content-length");
  if (cl !== null && Number(cl) > 256_000) return json({ ok: false, error: "BODY_TOO_LARGE" }, 413, env);

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "BAD_JSON" }, 400, env);

  const tool = String(body.tool || "").trim();
  if (!ALLOWED_JOB_TOOLS.has(tool)) return json({ ok: false, error: "TOOL_NOT_ALLOWED" }, 400, env);

  const inputKey  = String(body.inputKey  || "").trim();
  const outputKey = String(body.outputKey || "").trim();
  if (!inputKey || !outputKey) return json({ ok: false, error: "MISSING_KEYS" }, 400, env);

  const options = body.options || {};
  const opId    = body.opId ? String(body.opId).trim() : null;
  const { clientId, setCookie } = await getClientId(request, env);
  const extra = setCookie ? { "set-cookie": setCookie } : {};

  const rl = await rateLimit(env, `rl:job:${clientId}`, Number(env.RL_JOB_PER_MINUTE || "10"), 60);
  if (!rl.ok) return json({ ok: false, error: "RATE_LIMIT", retryAfter: rl.retryAfter }, 429, env, extra);

  const dObj = creditDO(env, clientId);
  const cost = TOOL_COSTS[tool] || 1;

  if (opId) {
    const lr = await dObj.fetch("https://do/lock-op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opId, ttlMs: 10 * 60_000 }) });
    const lj = await lr.json().catch(() => ({}));
    if (!lr.ok || !lj.ok) return json({ ok: false, error: "OP_LOCK_FAILED" }, 409, env);
  }

  const cr = await dObj.fetch("https://do/consume", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool, cost, opId }) });
  const cj = await cr.json().catch(() => ({}));
  if (!cr.ok || !cj.ok) {
    if (opId) ctx.waitUntil(dObj.fetch("https://do/finalize-op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opId, ok: false }) }));
    return json({ ok: false, error: "NO_CREDITS" }, 402, env);
  }

  const jobId = crypto.randomUUID();
  const ttl   = Number(env.JOB_TTL_SECONDS || DEFAULT_JOB_TTL_SECONDS);
  try {
    await env.DB.prepare(
      `INSERT INTO jobs (job_id, tool, status, input_key, output_key, created_at, updated_at, client_id, ttl_seconds, cost, op_id, expires_at)
       VALUES (?1, ?2, 'pending', ?3, ?4, unixepoch(), unixepoch(), ?5, ?6, ?7, ?8, unixepoch() + ?6)`
    ).bind(jobId, tool, inputKey, outputKey, clientId, ttl, cost, opId).run();
  } catch (dbErr) {
    // DB başarısız → tüketilen krediyi iade et
    ctx.waitUntil(dObj.fetch("https://do/refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool, cost, jobId }) }));
    if (opId) ctx.waitUntil(dObj.fetch("https://do/finalize-op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opId, ok: false }) }));
    return json({ ok: false, error: "DB_ERROR", message: "İş oluşturulamadı, lütfen tekrar deneyin." }, 500, env);
  }

  const processorPath = TOOL_ENDPOINT[tool];
  if (env?.JOB_QUEUE && String(env.QUEUE_MODE || "").toLowerCase() === "on") {
    await env.JOB_QUEUE.send({ jobId, tool, inputKey, outputKey, options, processorPath, clientId, cost, opId });
  } else {
    ctx.waitUntil(dispatchToProcessor(env, { jobId, tool, inputKey, outputKey, options, processorPath, clientId, cost, opId }));
  }

  return json({ ok: true, data: { jobId, status: "pending", pollUrl: `/api/jobs/${jobId}/status`, resultUrl: `/api/jobs/${jobId}/result` } }, 202, env);
}
