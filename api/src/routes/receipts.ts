import { Router, Response } from "express";
import path from "path";
import { body, validationResult } from "express-validator";
import { db } from "../db";
import { requireAuth, requireAdmin, AuthedRequest } from "../middleware/auth";
import { uploadReceiptFile, RECEIPTS_DIR } from "../services/receiptUpload";

export const receiptsRouter = Router();

receiptsRouter.use(requireAuth);

// Any logged-in user can submit a receipt — viewing the archive is admin-only (see the
// requireAdmin routes below), so uploaders don't get to browse each other's purchases.
receiptsRouter.post(
  "/",
  uploadReceiptFile.array("files", 5),
  body("description").isString().trim().isLength({ min: 1, max: 500 }),
  body("amount").optional({ values: "falsy" }).isFloat({ gt: 0 }).toFloat(),
  body("purchased_at").isISO8601(),
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      res.status(400).json({ error: "Attach at least one photo or PDF of the receipt" });
      return;
    }

    const [receipt] = await db("receipts")
      .insert({
        uploaded_by: req.user!.id,
        description: req.body.description,
        amount: req.body.amount ?? null,
        purchased_at: req.body.purchased_at
      })
      .returning("*");

    await db("receipt_files").insert(
      files.map((file) => ({
        receipt_id: receipt.id,
        stored_filename: file.filename,
        original_filename: file.originalname,
        mime_type: file.mimetype,
        size_bytes: file.size
      }))
    );

    res.status(201).json({ id: receipt.id });
  }
);

receiptsRouter.get("/", requireAdmin, async (_req: AuthedRequest, res: Response) => {
  const receipts = await db("receipts as r")
    .leftJoin("users as u", "u.id", "r.uploaded_by")
    .select("r.*", "u.name as uploaded_by_name", "u.email as uploaded_by_email")
    .orderBy("r.purchased_at", "desc");

  const files = await db("receipt_files").select("id", "receipt_id", "original_filename", "mime_type", "size_bytes");
  const filesByReceipt = new Map<number, typeof files>();
  for (const file of files) {
    const list = filesByReceipt.get(file.receipt_id) || [];
    list.push(file);
    filesByReceipt.set(file.receipt_id, list);
  }

  res.json(receipts.map((r) => ({ ...r, files: filesByReceipt.get(r.id) || [] })));
});

receiptsRouter.get("/:id/files/:fileId", requireAdmin, async (req: AuthedRequest, res: Response) => {
  const receiptId = Number(req.params.id);
  const fileId = Number(req.params.fileId);
  if (!Number.isInteger(receiptId) || !Number.isInteger(fileId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const file = await db("receipt_files").where({ id: fileId, receipt_id: receiptId }).first();
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  // stored_filename is always one we generated (services/receiptUpload.ts), never taken
  // from user input at read time — path.basename() here is defense in depth only.
  const filePath = path.join(RECEIPTS_DIR, path.basename(file.stored_filename));
  res.type(file.mime_type);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File not found" });
  });
});
