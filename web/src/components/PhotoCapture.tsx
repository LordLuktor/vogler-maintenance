import { useState } from "react";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

// Downscales large phone-camera photos client-side before upload so shop wifi/cell
// data isn't spent shipping full-resolution originals for what's just a repair reference photo.
async function resizeImage(file: File): Promise<File> {
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

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

export default function PhotoCapture({ onChange }: { onChange: (files: File[]) => void }) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    try {
      const resized = await Promise.all(Array.from(fileList).slice(0, 5).map(resizeImage));
      setPreviews(resized.map((f) => URL.createObjectURL(f)));
      onChange(resized);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <label htmlFor="photos">Photo (optional, up to 5)</label>
      <input
        id="photos"
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        disabled={busy}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {busy && <p className="muted">Processing photo…</p>}
      {previews.length > 0 && (
        <div className="photo-thumbs">
          {previews.map((src) => (
            <img key={src} src={src} alt="Selected" />
          ))}
        </div>
      )}
    </div>
  );
}
