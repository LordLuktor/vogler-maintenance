import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif"
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED_MIME_TYPES[file.mimetype] || path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  }
});

// Per-request cap; also the per-ticket total enforced in POST /tickets/:id/photos.
export const MAX_PHOTOS_PER_REQUEST = 10;
export const MAX_PHOTOS_PER_TICKET = 30;

export const uploadPhoto = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_PHOTOS_PER_REQUEST },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      cb(new Error("Unsupported file type"));
      return;
    }
    cb(null, true);
  }
});

export { UPLOAD_DIR };
