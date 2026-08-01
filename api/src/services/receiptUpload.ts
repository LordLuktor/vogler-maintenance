import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

// Deliberately NOT under UPLOAD_DIR (services/upload.ts) — that directory is mounted
// read-through at the public, unauthenticated /uploads static route. Receipts are
// financial documents and must only ever be reachable through the authenticated,
// admin-gated /api/receipts/:id/files/:fileId route, so they live in their own,
// never-statically-served directory.
export const RECEIPTS_DIR = process.env.RECEIPTS_DIR || path.join(__dirname, "..", "..", "receipts");
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "application/pdf": ".pdf"
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, RECEIPTS_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED_MIME_TYPES[file.mimetype] || path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  }
});

export const uploadReceiptFile = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      cb(new Error("Unsupported file type"));
      return;
    }
    cb(null, true);
  }
});
