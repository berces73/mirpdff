// ============================================================
// src/zip.js — Batch ZIP stream (no external dep, Cloudflare Workers uyumlu)
// ============================================================

import { json, corsHeaders as getCorsHeaders } from "./helpers.js";
import { getClientId } from "./clientid.js";

export async function handleBatchZip(request, env, batchId) {
  const { clientId, setCookie } = await getClientId(request, env);
  const { results } = await env.DB.prepare(
    `SELECT job_id, tool, status, output_key, created_at
     FROM jobs WHERE batch_id = ?1 AND client_id = ?2 ORDER BY created_at ASC`
  ).bind(batchId, clientId).all();

  if (!results || results.length === 0)
    return json({ ok: false, error: "NOT_FOUND", message: "Batch bulunamadı." }, 404, env);

  const completed = results.filter(j => j.status === "done" && j.output_key);
  if (completed.length === 0)
    return json({ ok: false, error: "NO_OUTPUT", message: "Bu batch içinde tamamlanmış çıktı yok." }, 400, env);

  const readable = createBatchZip(env, completed);
  const h = {
    ...getCorsHeaders(env),
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="batch_${batchId.slice(0, 8)}.zip"`,
    "cache-control": "no-cache",
  };
  if (setCookie) h["set-cookie"] = setCookie;
  return new Response(readable, { headers: h });
}

function createBatchZip(env, jobs) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    try {
      const encoder = new TextEncoder();
      const files = [];
      let offset = 0;

      for (const job of jobs) {
        const obj = await env.PDF_R2.get(job.output_key);
        if (!obj) continue;
        const ab = await obj.arrayBuffer();
        const ext = getExtensionForTool(job.tool);
        const filename = `${job.tool}_${job.job_id.slice(0, 8)}.${ext}`;
        const filenameBytes = encoder.encode(filename);
        const crc = calculateCRC32(ab);

        const header = new Uint8Array(30 + filenameBytes.length);
        const view = new DataView(header.buffer);
        const now = new Date();
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, dosTime(now), true);
        view.setUint16(12, dosDate(now), true);
        view.setUint32(14, crc, true);
        view.setUint32(18, ab.byteLength, true);
        view.setUint32(22, ab.byteLength, true);
        view.setUint16(26, filenameBytes.length, true);
        view.setUint16(28, 0, true);
        header.set(filenameBytes, 30);

        await writer.write(header);
        await writer.write(new Uint8Array(ab));
        files.push({ filenameBytes, filename, offset, size: ab.byteLength, crc, time: now });
        offset += header.byteLength + ab.byteLength;
      }

      const cdStart = offset;
      for (const f of files) {
        const cd = new Uint8Array(46 + f.filenameBytes.length);
        const v = new DataView(cd.buffer);
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, 20, true); v.setUint16(6, 20, true);
        v.setUint16(8, 0, true); v.setUint16(10, 0, true);
        v.setUint16(12, dosTime(f.time), true); v.setUint16(14, dosDate(f.time), true);
        v.setUint32(16, f.crc, true); v.setUint32(20, f.size, true); v.setUint32(24, f.size, true);
        v.setUint16(28, f.filenameBytes.length, true);
        v.setUint16(30, 0, true); v.setUint16(32, 0, true);
        v.setUint16(34, 0, true); v.setUint16(36, 0, true);
        v.setUint32(38, 0, true); v.setUint32(42, f.offset, true);
        cd.set(f.filenameBytes, 46);
        await writer.write(cd);
        offset += cd.byteLength;
      }

      const eocd = new Uint8Array(22);
      const e = new DataView(eocd.buffer);
      e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true);
      e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
      e.setUint32(12, offset - cdStart, true); e.setUint32(16, cdStart, true); e.setUint16(20, 0, true);
      await writer.write(eocd);
      await writer.close();
    } catch (err) {
      console.error("batch zip error", err);
      await writer.abort(err);
    }
  })();

  return readable;
}

function dosTime(date) {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
}
function dosDate(date) {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}
function calculateCRC32(data) {
  const bytes = new Uint8Array(data);
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function getExtensionForTool(tool) {
  const map = {
    "compress": "pdf", "compress-strong": "pdf", "pdf-to-word": "docx", "ocr": "pdf",
    "merge": "pdf", "split": "pdf", "rotate": "pdf", "unlock": "pdf", "protect": "pdf",
    "jpg-to-pdf": "pdf", "pdf-to-jpg": "jpg", "word-to-pdf": "pdf",
    "excel-to-pdf": "pdf", "ppt-to-pdf": "pdf",
  };
  return map[tool] || "bin";
}
