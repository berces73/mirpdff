// ============================================================
// src/tools/unlock.js
// Şifre korumalı PDF'lerin kilidini açar.
//
// Strateji (sırayla):
//   1) qpdf  — kullanıcı şifresi sağlandıysa önce dene
//   2) qpdf  — şifresiz (açık içerik şifre = boş string)
//   3) gs    — Ghostscript fallback (bazı eski şifreleme türleri)
//
// options.password: string | undefined  (kullanıcının girdiği şifre)
//
// Dönüş: kilidi açılmış PDF Buffer'ı
//        Başarısız olursa Error fırlatır.
// ============================================================

import { execFile }  from "child_process";
import { promisify } from "util";
import path          from "path";
import fs            from "fs/promises";
import { log }       from "../logger.js";

const execFileAsync = promisify(execFile);

const QPDF_BIN     = process.env.PROC_QPDF_BIN || "qpdf";
const GS_BIN       = process.env.PROC_GS_BIN   || "gs";
const TOOL_TIMEOUT = Number(process.env.PROC_UNLOCK_TIMEOUT_MS || String(60_000)); // 1 dk

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function isPdf(buf) {
  return buf.slice(0, 5).toString("ascii").startsWith("%PDF-");
}

async function tryQpdf(inputPath, outputPath, password) {
  const args = [
    "--decrypt",
    "--no-warn",
    "--suppress-warnings",
  ];

  if (password) {
    args.push(`--password=${password}`);
  }

  args.push(inputPath, outputPath);

  try {
    const { stderr } = await execFileAsync(QPDF_BIN, args, {
      timeout: TOOL_TIMEOUT,
      maxBuffer: 50 * 1024 * 1024,
    });
    if (stderr && stderr.trim() && !stderr.includes("WARNING: file is not encrypted")) {
      log("warn", "qpdf_stderr", { stderr: stderr.slice(0, 300), password: !!password });
    }
    return true;
  } catch (err) {
    // qpdf exit 2 = uyarılarla başarılı, exit 3 = şifre hatalı / şifreli
    const code = err?.code ?? err?.status;
    if (code === 2) return true;  // uyarılı ama başarılı
    log("debug", "qpdf_failed", { code, password: !!password, msg: String(err?.message || "").slice(0, 200) });
    return false;
  }
}

async function tryGhostscript(inputPath, outputPath, password) {
  const args = [
    "-q",
    "-dNOPAUSE",
    "-dBATCH",
    "-dSAFER",
    "-dNOPROMPT",
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dNOENCRYPT",
    `-sOutputFile=${outputPath}`,
  ];

  if (password) {
    args.push(`-sPDFPassword=${password}`);
  }

  args.push(inputPath);

  try {
    const { stderr } = await execFileAsync(GS_BIN, args, {
      timeout: TOOL_TIMEOUT,
      maxBuffer: 50 * 1024 * 1024,
    });
    if (stderr && stderr.trim()) {
      log("warn", "gs_unlock_stderr", { stderr: stderr.slice(0, 300) });
    }
    return true;
  } catch (err) {
    log("debug", "gs_unlock_failed", { msg: String(err?.message || "").slice(0, 200) });
    return false;
  }
}

// ─── Ana export ──────────────────────────────────────────────────────────────

export async function unlock({ inputBuffer, options, tmpDir, jobId }) {
  if (!isPdf(inputBuffer)) {
    throw new Error("Geçersiz dosya: PDF değil");
  }

  const password   = (options?.password || "").trim();
  const inputPath  = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "output.pdf");

  await fs.writeFile(inputPath, inputBuffer);

  log("debug", "unlock_start", {
    jobId,
    inputBytes: inputBuffer.length,
    hasPassword: !!password,
  });

  let success = false;

  // Deneme 1: qpdf — kullanıcı şifresiyle (varsa)
  if (password) {
    success = await tryQpdf(inputPath, outputPath, password);
    if (success) log("debug", "unlock_via_qpdf_with_password", { jobId });
  }

  // Deneme 2: qpdf — boş şifre (çoğu "korumalı ama açık" PDF buraya düşer)
  if (!success) {
    success = await tryQpdf(inputPath, outputPath, "");
    if (success) log("debug", "unlock_via_qpdf_empty_password", { jobId });
  }

  // Deneme 3: Ghostscript — fallback (eski RC4 şifreleme vb.)
  if (!success) {
    success = await tryGhostscript(inputPath, outputPath, password || "");
    if (success) log("debug", "unlock_via_ghostscript", { jobId });
  }

  if (!success) {
    throw new Error(
      "PDF kilidi açılamadı. " +
      (password
        ? "Girilen şifre yanlış olabilir veya bu PDF türü desteklenmiyor."
        : "Doğru şifreyi girerek tekrar deneyin.")
    );
  }

  // Çıktı dosyasını oku
  let outputBuffer;
  try {
    outputBuffer = await fs.readFile(outputPath);
  } catch {
    throw new Error("Kilidi açılmış PDF çıktısı oluşturulamadı");
  }

  if (!outputBuffer || outputBuffer.length === 0) {
    throw new Error("Kilidi açılmış PDF boş çıktı verdi");
  }

  log("debug", "unlock_done", {
    jobId,
    inputBytes:  inputBuffer.length,
    outputBytes: outputBuffer.length,
  });

  return outputBuffer;
}
