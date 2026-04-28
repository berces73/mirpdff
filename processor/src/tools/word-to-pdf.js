// ============================================================
// src/tools/word-to-pdf.js
// LibreOffice headless ile DOCX/DOC/XLSX/PPTX → PDF dönüşümü
//
// options.inputFormat: otomatik tespit edilir (docx, xlsx, pptx, doc, xls, ppt)
// ============================================================

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { log } from "../logger.js";

const execFileAsync = promisify(execFile);

const LO_BIN     = process.env.PROC_LO_BIN    || "libreoffice";
const TOOL_TIMEOUT = Number(process.env.PROC_OFFICE_TIMEOUT_MS || String(120_000)); // 2 dk

// Desteklenen formatlar ve MIME type tespiti
const SUPPORTED_EXTS = new Set(["docx","doc","odt","rtf","xlsx","xls","ods","pptx","ppt","odp"]);

function detectExt(filename, mimeType) {
  const byName = (filename || "").split(".").pop().toLowerCase();
  if (SUPPORTED_EXTS.has(byName)) return byName;
  // MIME fallback
  const mimeMap = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.oasis.opendocument.text": "odt",
    "application/rtf": "rtf",
    "text/rtf": "rtf",
  };
  return mimeMap[mimeType] || "docx";
}

export async function wordToPdf({ inputBuffer, options, tmpDir, jobId }) {
  const ext = detectExt(options.filename, options.mimeType);

  if (!SUPPORTED_EXTS.has(ext)) {
    throw new Error(`Desteklenmeyen format: .${ext}. Desteklenenler: ${[...SUPPORTED_EXTS].join(", ")}`);
  }

  const inputPath = path.join(tmpDir, `input.${ext}`);
  await fs.writeFile(inputPath, inputBuffer);

  log("debug", "lo_to_pdf_start", { jobId, ext, inputBytes: inputBuffer.length });

  const { stdout, stderr } = await execFileAsync(
    LO_BIN,
    [
      "--headless",
      "--norestore",
      "--nofirststartwizard",
      "--convert-to", "pdf",
      "--outdir", tmpDir,
      inputPath,
    ],
    {
      timeout: TOOL_TIMEOUT,
      maxBuffer: 50 * 1024 * 1024,
      env: {
        ...process.env,
        HOME: tmpDir,
        DISPLAY: "",
      },
    }
  );

  if (stderr && stderr.trim()) {
    log("warn", "lo_stderr", { jobId, stderr: stderr.slice(0, 500) });
  }

  const outputPath = path.join(tmpDir, `input.pdf`);
  let outputBuffer;
  try {
    outputBuffer = await fs.readFile(outputPath);
  } catch {
    // LibreOffice bazen farklı isim verir, dizini tara
    const files = await fs.readdir(tmpDir);
    const match = files.find(f => f !== `input.${ext}` && f.endsWith(".pdf"));
    if (!match) {
      throw new Error(`LibreOffice PDF çıktısı bulunamadı. stdout: ${stdout?.slice(0, 300)}`);
    }
    outputBuffer = await fs.readFile(path.join(tmpDir, match));
  }

  if (!outputBuffer || outputBuffer.length === 0) {
    throw new Error("LibreOffice boş PDF üretti");
  }

  log("debug", "lo_to_pdf_done", {
    jobId,
    ext,
    inputBytes: inputBuffer.length,
    outputBytes: outputBuffer.length,
  });

  return outputBuffer;
}
