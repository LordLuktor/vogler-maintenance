import { useState } from "react";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

// Same downscale as PhotoCapture for phone-camera images; PDFs (and HEIC, which
// createImageBitmap can't decode reliably) pass through untouched.
async function resizeIfImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif") {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

export default function ReceiptFileCapture({ onChange }: { onChange: (files: File[]) => void }) {
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    try {
      const processed = await Promise.all(Array.from(fileList).slice(0, 5).map(resizeIfImage));
      setNames(processed.map((f) => f.name));
      onChange(processed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <label htmlFor="receiptFiles">Receipt photo or PDF (up to 5)</label>
      <input
        id="receiptFiles"
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        multiple
        disabled={busy}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {busy && <p className="muted">Processing…</p>}
      {names.length > 0 && (
        <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
