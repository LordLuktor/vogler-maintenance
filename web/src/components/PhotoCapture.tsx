import { useEffect, useRef, useState } from "react";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;
export const MAX_PHOTOS = 10;

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

interface Picked {
  file: File;
  preview: string;
}

// Two separate inputs because `capture` forces camera-only on Android (no gallery/files),
// while leaving it off hides the camera on some browsers. Picks accumulate across taps so
// a reporter can shoot several photos one at a time, or mix camera shots with saved files.
export default function PhotoCapture({
  onChange,
  max = MAX_PHOTOS,
  label = `Photos (optional, up to ${max})`
}: {
  onChange: (files: File[]) => void;
  max?: number;
  label?: string;
}) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => picked.forEach((p) => URL.revokeObjectURL(p.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(next: Picked[]) {
    setPicked(next);
    onChange(next.map((p) => p.file));
  }

  async function handleFiles(input: HTMLInputElement) {
    const fileList = input.files;
    if (!fileList || fileList.length === 0) return;
    const room = max - picked.length;
    const incoming = Array.from(fileList)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, Math.max(0, room));
    // Clear so picking the same file again still fires onChange.
    input.value = "";
    if (incoming.length === 0) return;

    setBusy(true);
    try {
      const resized = await Promise.all(incoming.map(resizeImage));
      update([...picked, ...resized.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    } finally {
      setBusy(false);
    }
  }

  function remove(index: number) {
    URL.revokeObjectURL(picked[index].preview);
    update(picked.filter((_, i) => i !== index));
  }

  const full = picked.length >= max;

  return (
    <div className="field">
      <label>{label}</label>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFiles(e.target)}
      />
      <input
        ref={filesRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target)}
      />
      <div className="photo-actions">
        <button type="button" className="btn btn-secondary" disabled={busy || full} onClick={() => cameraRef.current?.click()}>
          Take photo
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy || full} onClick={() => filesRef.current?.click()}>
          Choose from files
        </button>
      </div>
      {busy && <p className="muted">Processing photo…</p>}
      {picked.length > 0 && (
        <>
          <div className="photo-thumbs">
            {picked.map((p, i) => (
              <div key={p.preview} className="photo-thumb">
                <img src={p.preview} alt={`Selected photo ${i + 1}`} />
                <button type="button" className="photo-remove" aria-label={`Remove photo ${i + 1}`} onClick={() => remove(i)}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {picked.length} of {max} photos{full ? " — limit reached" : ""}
          </p>
        </>
      )}
    </div>
  );
}
