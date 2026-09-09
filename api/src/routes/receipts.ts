import { Router, Response, NextFunction } from "express";
import path from "path";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import { db } from "../db";
import { requireAuth, requireReceiptsAccess, AuthedRequest } from "../middleware/auth";
import { uploadReceiptFile, uploadReceiptFileForScan, RECEIPTS_DIR } from "../services/receiptUpload";
import { notifyNewReceipt, notifyReceiptItemReturned } from "../services/notify";
import { scanReceiptItems, UnscannableFileError } from "../services/receiptScan";

export const receiptsRouter = Router();

receiptsRouter.use(requireAuth);

// Each call costs real money (a Claude API request) — cap it well below anything a person
// filling out a form would hit, so a stuck retry loop can't run up the bill unnoticed.
const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

// Best-effort convenience, not a source of truth: reads a just-selected file (before the
// receipt is even submitted) and returns candidate line items for the form to prefill.
// Never blocks manual entry — any failure just means an empty prefill.
receiptsRouter.post("/scan", scanLimiter, uploadReceiptFileForScan.single("file"), async (req: AuthedRequest, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  try {
    const items = await scanReceiptItems(file.buffer, file.mimetype);
    res.json({ items });
  } catch (err) {
    if (err instanceof UnscannableFileError) {
      res.json({ items: [] });
      return;
    }
    console.error("[receipts] scan failed:", err);
    res.status(502).json({ error: "Couldn't read that receipt automatically" });
  }
});

// Multer parses multipart text fields as plain strings, so the "items" field arrives as a
// JSON-encoded string rather than an array — decode it here so the express-validator checks
// below can validate it as one.
function parseItemsField(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (typeof req.body.items === "string") {
    try {
      req.body.items = JSON.parse(req.body.items);
    } catch {
      req.body.items = undefined;
    }
  }
  next();
}

// Any logged-in user can submit a receipt — viewing the archive requires admin or the
// narrower can_view_receipts role (see the requireReceiptsAccess routes below), so
// uploaders don't get to browse each other's purchases unless granted that access.
receiptsRouter.post(
  "/",
  uploadReceiptFile.array("files", 5),
  parseItemsField,
  body("items").isArray({ min: 1 }),
  body("items.*.description").isString().trim().isLength({ min: 1, max: 500 }),
  body("items.*.amount").optional({ values: "falsy" }).isFloat({ gt: 0 }).toFloat(),
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

    const items: { description: string; amount?: number }[] = req.body.items;

    const [receipt] = await db("receipts")
      .insert({
        uploaded_by: req.user!.id,
        purchased_at: req.body.purchased_at
      })
      .returning("*");

    await db("receipt_items").insert(
      items.map((item) => ({
        receipt_id: receipt.id,
        description: item.description,
        amount: item.amount ?? null
      }))
    );

    await db("receipt_files").insert(
      files.map((file) => ({
        receipt_id: receipt.id,
        stored_filename: file.filename,
        original_filename: file.originalname,
        mime_type: file.mimetype,
        size_bytes: file.size
      }))
    );

    await notifyNewReceipt({ id: receipt.id, uploaded_by: req.user!.id, items, file_count: files.length });

    res.status(201).json({ id: receipt.id });
  }
);

receiptsRouter.get("/", requireReceiptsAccess, async (_req: AuthedRequest, res: Response) => {
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

  const items = await db("receipt_items as i")
    .leftJoin("users as u", "u.id", "i.returned_by")
    .select("i.*", "u.name as returned_by_name")
    .orderBy("i.id", "asc");
  const itemsByReceipt = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByReceipt.get(item.receipt_id) || [];
    list.push(item);
    itemsByReceipt.set(item.receipt_id, list);
  }

  res.json(
    receipts.map((r) => ({
      ...r,
      files: filesByReceipt.get(r.id) || [],
      items: itemsByReceipt.get(r.id) || []
    }))
  );
});

receiptsRouter.get("/:id/files/:fileId", requireReceiptsAccess, async (req: AuthedRequest, res: Response) => {
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

// Marking/unmarking is gated behind the same access as browsing the archive — returns are
// tracked by whoever reviews receipts, not necessarily the original uploader.
receiptsRouter.patch(
  "/:id/items/:itemId",
  requireReceiptsAccess,
  body("is_returned").isBoolean().toBoolean(),
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const receiptId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(receiptId) || !Number.isInteger(itemId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const item = await db("receipt_items").where({ id: itemId, receipt_id: receiptId }).first();
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    const isReturned = req.body.is_returned as boolean;

    const [updated] = await db("receipt_items")
      .where({ id: itemId })
      .update({
        is_returned: isReturned,
        returned_at: isReturned ? db.fn.now() : null,
        returned_by: isReturned ? req.user!.id : null
      })
      .returning("*");

    // Only fires on the false -> true transition, so re-saving an already-returned item
    // (or unmarking one) never sends a duplicate email.
    if (isReturned && !item.is_returned) {
      await notifyReceiptItemReturned({
        receiptId,
        itemId,
        description: item.description,
        amount: item.amount,
        returnedBy: req.user!.id
      });
    }

    res.json(updated);
  }
);
