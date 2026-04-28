// ============================================================
// src/batch.js — Batch submit (N dosya tek batch_id altında)
//   handleBatchSubmit  → POST /api/batch-submit
//   handleBatchStatus  → GET  /api/batches/:batchId/status
// ============================================================

import { json, ALLOWED_JOB_TOOLS, TOOL_COSTS, DEFAULT_JOB_TTL_SECONDS } from "./helpers.js";
import { getClientId, creditDO } from "./clientid.js";
import { dispatchToProcessor } from "./jobs.js";
import { completeAbuseCheck } from "./ratelimit.js";
import { requireAuth } from "./auth.js";

// Araç → processor path mapping (jobs.js TOOL_ENDPOINT'i buraya gerek yok; doğrudan türetiriz)
function processorPathForTool(tool) {
  if (tool === "compress-strong") return "/compress";
  if (tool === "pdf-to-word")    return "/pdf-to-word";
  if (tool === "ocr")            return "/ocr";
  return `/${tool}`;
}

// Araç → form options mapping
function optionsForTool(tool, form) {
  switch (tool) {
    case "compress-strong": return { compression_level: String(form.get("level") || "recommended") };
    case "pdf-to-word":     return { format: String(form.get("format") || "docx") };
    case "ocr":             return { lang: String(form.get("lang") || "tur+eng") };
    default:                return {};
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/batch-submit
// ─────────────────────────────────────────────────────────────
export async function handleBatchSubmit(request, env, ctx) {
  // Abuse protection
  const abuse = await completeAbuseCheck(env, request, { action: "batch", requireTurnstile: false });
  if (!abuse.allowed) {
    return json({ ok: false, error: "RATE_LIMIT", reason: abuse.reason, retryAfter: abuse.retryAfter }, 429, env);
  }

  // Auth optional — Pro/Enterprise: 20 dosya; free/anon: 1 dosya
  let role = "free";
  try {
    const auth = await requireAuth(request, env);
    if (auth?.sub) {
      const row = await env.DB.prepare("SELECT role FROM users WHERE id=?1").bind(auth.sub).first();
      if (row?.role) role = String(row.role);
    }
  } catch { /* anon */ }

  const maxFiles = (role === "pro" || role === "enterprise") ? 20 : 1;

  const { clientId, setCookie } = await getClientId(request, env);
  const extra = setCookie ? { "set-cookie": setCookie } : {};

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "BAD_REQUEST", message: "Form verisi okunamadı." }, 400, env, extra);
  }

  const tool = String(form.get("tool") || "").trim();
  if (!tool || !ALLOWED_JOB_TOOLS.has(tool)) {
    return json({ ok: false, error: "BAD_REQUEST", message: "Bu araç batch için desteklenmiyor." }, 400, env, extra);
  }

  // Dosya listesini topla (files[] veya file)
  const files = form.getAll("files").filter(f => f && typeof f.arrayBuffer === "function");
  if (!files.length) {
    const single = form.get("file");
    if (single && typeof single.arrayBuffer === "function") files.push(single);
  }
  if (!files.length) {
    return json({ ok: false, error: "BAD_REQUEST", message: "Dosya bulunamadı." }, 400, env, extra);
  }
  if (files.length > maxFiles) {
    const msg = (role === "pro" || role === "enterprise")
      ? `En fazla ${maxFiles} dosya yükleyebilirsiniz.`
      : "Ücretsiz planda tek dosya işlenebilir.";
    return json({ ok: false, error: "LIMIT", message: msg }, 413, env, extra);
  }

  const options       = optionsForTool(tool, form);
  const processorPath = processorPathForTool(tool);
  const perFileCost   = Number(TOOL_COSTS[tool] ?? 1);
  const totalCost     = perFileCost * files.length;
  const batchId       = crypto.randomUUID();
  const maxMb         = Number(env.MAX_UPLOAD_MB || "50");
  const maxBytes      = maxMb * 1024 * 1024;

  // Kredileri tek seferde tüket — çifte ücretlendirmeyi ve yarış koşulunu önler
  const dObj = creditDO(env, clientId);
  const consumeRes  = await dObj.fetch("https://do/consume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, cost: totalCost, opId: `batch:${batchId}` }),
  });
  const consumeJson = await consumeRes.json().catch(() => ({}));
  if (!consumeRes.ok || !consumeJson.ok) {
    return json({ ok: false, error: { code: "CREDIT_EXHAUSTED" } }, 402, env, extra);
  }

  const jobs = [];

  // Tüm dosyaları önce hazırla — büyüklük kontrolü sıralı, upload paralel
  const prepared = [];
  for (const file of files) {
    const buf = await file.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      return json({ ok: false, error: "LIMIT", message: `Dosya çok büyük. Maks: ${maxMb} MB` }, 413, env, extra);
    }
    const jobId     = crypto.randomUUID();
    const inputKey  = `${clientId}/${jobId}/input.bin`;
    const outputKey = `${clientId}/${jobId}/output.bin`;
    prepared.push({ file, buf, jobId, inputKey, outputKey });
  }

  // R2 upload'ları paralel — sıralı yerine eşzamanlı (10 dosya için ~10x daha hızlı)
  await Promise.all(prepared.map(({ buf, inputKey, file }) =>
    env.PDF_R2.put(inputKey, buf, {
      httpMetadata: { contentType: "application/octet-stream" },
      customMetadata: { filename: file.name || "upload", batchId },
    })
  ));

  // D1 insert'leri tek batch'te — N ayrı await yerine 1 round-trip
  const insertStmts = prepared.map(({ jobId, inputKey, outputKey }) =>
    env.DB.prepare(
      `INSERT INTO jobs
         (job_id, batch_id, client_id, tool, status, input_key, output_key,
          ttl_seconds, cost, op_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'queued', ?5, ?6, ?7, ?8, NULL, unixepoch(), unixepoch())`
    ).bind(jobId, batchId, clientId, tool, inputKey, outputKey, DEFAULT_JOB_TTL_SECONDS, perFileCost)
  );
  await env.DB.batch(insertStmts);

  // Dispatch — her iş için waitUntil (paralel, non-blocking)
  for (const { jobId, inputKey, outputKey, file } of prepared) {
    ctx.waitUntil(
      dispatchToProcessor(env, {
        jobId, tool, inputKey, outputKey, options, processorPath,
        clientId, cost: perFileCost, opId: null,
      })
    );
    jobs.push({ jobId, filename: file.name || "upload" });
  }

  return json({ ok: true, batchId, jobs }, 200, env, extra);
}

// ─────────────────────────────────────────────────────────────
// GET /api/batches/:batchId/status
// ─────────────────────────────────────────────────────────────
export async function handleBatchStatus(request, env, batchId) {
  const { clientId, setCookie } = await getClientId(request, env);
  const extra = setCookie ? { "set-cookie": setCookie } : {};

  const rows = await env.DB.prepare(
    `SELECT job_id, tool, status, error_code, error_message, created_at, updated_at
     FROM jobs
     WHERE batch_id = ?1 AND client_id = ?2
     ORDER BY created_at ASC`
  ).bind(batchId, clientId).all();

  const jobs = (rows?.results || []).map(r => ({
    jobId:  r.job_id,
    tool:   r.tool,
    status: r.status,
    error:  r.error_code ? { code: r.error_code, message: r.error_message } : null,
  }));

  return json({ ok: true, batchId, jobs }, 200, env, extra);
}
