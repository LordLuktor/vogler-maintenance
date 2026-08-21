import { Router, Response } from "express";
import rateLimit from "express-rate-limit";
import { body, query, validationResult } from "express-validator";
import { db } from "../db";
import { requireAuth, requireAdmin, optionalAuth, AuthedRequest } from "../middleware/auth";
import { uploadPhoto } from "../services/upload";
import { notifyNewTicket, notifyTicketStatusChange } from "../services/notify";
import { ISSUE_TYPES } from "../issueTypes";
import { completeSchedule } from "../services/pmSchedules";
import { getAllowedLocationIds } from "../services/permissions";
import { notifyLowStock } from "../services/inventoryAlerts";
import { listTicketParts, logTicketPart, removeTicketPart, updateTicketPartQuantity } from "../services/ticketParts";

export const ticketsRouter = Router();

// Public report-submission endpoint has no login by design, so it's the most exposed
// surface in the app — rate-limit hard by IP to blunt spam/abuse.
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

// Public: submit a new ticket from a location's QR-linked report form. No auth required —
// but optionalAuth picks up who it is when the submitter happens to be logged in, so a
// staff member reporting their own ticket can skip straight to "acknowledged" instead of
// landing in the same "new"/unseen queue as an anonymous report nobody's looked at yet.
ticketsRouter.post(
  "/",
  reportLimiter,
  optionalAuth,
  uploadPhoto.array("photos", 5),
  body("location_id").isInt().toInt(),
  body("equipment_id").optional({ values: "falsy" }).isInt().toInt(),
  body("issue_type").isIn(ISSUE_TYPES),
  body("description").optional({ values: "falsy" }).isString().trim().isLength({ max: 2000 }),
  body("reporter_name").optional().isString().trim().isLength({ max: 200 }),
  body("reporter_phone").optional().isString().trim().isLength({ max: 30 }),
  // .isEmail().trim() only — no .normalizeEmail(), which rewrites addresses (e.g. strips
  // Gmail dots/+tags) and would send status updates to a string the reporter never typed.
  body("reporter_email").optional({ values: "falsy" }).isString().trim().isEmail().isLength({ max: 255 }),
  body("priority").optional().isIn(["low", "normal", "high", "urgent"]),
  async (req: AuthedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const description = (req.body.description || "").trim();
    if (req.body.issue_type === "other" && !description) {
      res.status(400).json({ error: "Please add a note describing the issue" });
      return;
    }

    const location = await db("locations").where({ id: req.body.location_id }).first();
    if (!location) {
      res.status(400).json({ error: "Unknown location" });
      return;
    }

    const [ticket] = await db("tickets")
      .insert({
        location_id: req.body.location_id,
        equipment_id: req.body.equipment_id || null,
        issue_type: req.body.issue_type,
        description,
        reporter_name: req.body.reporter_name || null,
        reporter_phone: req.body.reporter_phone || null,
        reporter_email: req.body.reporter_email || null,
        priority: req.body.priority || "normal",
        source: "web",
        status: req.user ? "acknowledged" : "new"
      })
      .returning("*");

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length > 0) {
      await db("ticket_photos").insert(
        files.map((file) => ({
          ticket_id: ticket.id,
          url: `/uploads/${file.filename}`,
          mime_type: file.mimetype,
          size_bytes: file.size
        }))
      );
    }

    await notifyNewTicket(ticket);

    res.status(201).json({ id: ticket.id });
  }
);

// Everything below is Scott's dashboard — requires login.
ticketsRouter.use(requireAuth);

ticketsRouter.get(
  "/",
  query("status").optional().isIn(["new", "acknowledged", "in_progress", "done", "rejected", "duplicate"]),
  // Repeated query params (?exclude_status=a&exclude_status=b) arrive as an array —
  // normalize a single occurrence to a one-element array so the rest of the validation
  // and query-building logic only has to handle one shape.
  query("exclude_status")
    .optional()
    .customSanitizer((value) => (Array.isArray(value) ? value : [value]))
    .custom((values: string[]) => values.every((v) => ["new", "acknowledged", "in_progress", "done", "rejected", "duplicate"].includes(v))),
  query("location_id").optional().isInt().toInt(),
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const allowedIds = await getAllowedLocationIds(req.user!);

    // Rank by actionability rather than plain recency: open work (new, then in_progress,
    // then acknowledged) surfaces above done tickets regardless of filters, and recency
    // only breaks ties within the same status.
    let ticketsQuery = db("tickets as t")
      .join("locations as l", "l.id", "t.location_id")
      .leftJoin("equipment as e", "e.id", "t.equipment_id")
      .select(
        "t.*",
        "l.name as location_name",
        "e.name as equipment_name"
      )
      .orderByRaw(
        `CASE t.status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'acknowledged' THEN 2 WHEN 'done' THEN 3 WHEN 'rejected' THEN 4 WHEN 'duplicate' THEN 5 ELSE 6 END, t.created_at DESC`
      );

    if (allowedIds !== null) {
      ticketsQuery = ticketsQuery.whereIn("t.location_id", allowedIds);
    }
    if (req.query.status) {
      ticketsQuery = ticketsQuery.where("t.status", req.query.status as string);
    }
    // Mutually exclusive with "status" in the UI, but if both were somehow sent, applying
    // both narrows rather than conflicts (whereNotIn on top of where is still well-defined).
    const excludeStatuses = req.query.exclude_status as string[] | undefined;
    if (excludeStatuses && excludeStatuses.length > 0) {
      ticketsQuery = ticketsQuery.whereNotIn("t.status", excludeStatuses);
    }
    if (req.query.location_id) {
      ticketsQuery = ticketsQuery.where("t.location_id", req.query.location_id as unknown as number);
    }

    const tickets = await ticketsQuery;
    res.json(tickets);
  }
);

ticketsRouter.get("/:id", async (req: AuthedRequest, res: Response) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId)) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  const ticket = await db("tickets as t")
    .join("locations as l", "l.id", "t.location_id")
    .leftJoin("equipment as e", "e.id", "t.equipment_id")
    .select("t.*", "l.name as location_name", "e.name as equipment_name")
    .where("t.id", ticketId)
    .first();

  // 404 rather than 403 when out of scope — don't confirm a ticket exists at all to
  // someone who isn't allowed to see its location.
  const allowedIds = await getAllowedLocationIds(req.user!);
  if (!ticket || (allowedIds !== null && !allowedIds.includes(ticket.location_id))) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const photos = await db("ticket_photos").where({ ticket_id: ticketId }).select("id", "url", "mime_type");
  const parts = await listTicketParts(ticketId);
  res.json({ ...ticket, photos, parts });
});

ticketsRouter.patch(
  "/:id/status",
  body("status").isIn(["new", "acknowledged", "in_progress", "done", "rejected", "duplicate"]),
  body("notes").optional({ values: "falsy" }).isString().trim().isLength({ max: 2000 }),
  body("items_used").optional().isArray(),
  body("items_used.*.item_id").isInt().toInt(),
  body("items_used.*.quantity").isInt({ min: 1 }).toInt(),
  body("items_used.*.notes").optional().isString().trim().isLength({ max: 500 }),
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const itemsUsed: { item_id: number; quantity: number; notes?: string }[] = req.body.items_used || [];
    if (itemsUsed.length > 0 && !req.user!.is_admin) {
      res.status(403).json({ error: "Admin access required to log inventory usage" });
      return;
    }

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId)) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    const update: Record<string, unknown> = { status: req.body.status };
    if (req.body.status === "done" || req.body.status === "rejected" || req.body.status === "duplicate") {
      update.resolved_at = db.fn.now();
    }
    if (req.body.notes !== undefined) {
      update.status_notes = req.body.notes || null;
    }

    const allowedIds = await getAllowedLocationIds(req.user!);
    let updateQuery = db("tickets").where({ id: ticketId });
    if (allowedIds !== null) {
      updateQuery = updateQuery.whereIn("location_id", allowedIds);
    }

    // Fetch the pre-update status so a same-status call (e.g. logging parts usage via this
    // same endpoint) doesn't re-fire a "your ticket status changed" email to the reporter.
    const before = await db("tickets").where({ id: ticketId }).first("status");

    const [ticket] = await updateQuery.update(update).returning("*");
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (before && before.status !== ticket.status) {
      await notifyTicketStatusChange(ticket);
    }

    if (req.body.status === "done") {
      const schedule = await db("pm_schedules").where({ current_ticket_id: ticketId }).first();
      if (schedule) await completeSchedule(schedule.id, { ticketId });
    }

    // A rejected or duplicate PM-generated ticket didn't actually get the maintenance done,
    // so don't record a completion — but the schedule's current_ticket_id still needs
    // clearing, otherwise the scheduler's whereNull("current_ticket_id") guard would
    // permanently block it from ever generating another ticket for this cycle.
    if (req.body.status === "rejected" || req.body.status === "duplicate") {
      await db("pm_schedules").where({ current_ticket_id: ticketId }).update({ current_ticket_id: null });
    }

    if (itemsUsed.length > 0) {
      // Fail the whole batch up front if any item isn't tracked at this ticket's location,
      // rather than partially applying some and silently no-op'ing others — logTicketPart()
      // returning null for an untracked item must never happen mid-loop, since ticket_parts
      // has to stay an exact mirror of what actually got decremented.
      const location = await db("locations").where({ id: ticket.location_id }).first("name");

      const itemIds = [...new Set(itemsUsed.map((u) => u.item_id))];
      const trackedStock = await db("inventory_stock")
        .where({ location_id: ticket.location_id })
        .whereIn("item_id", itemIds);
      const trackedItemIds = new Set(trackedStock.map((s) => s.item_id));
      const untracked = itemIds.filter((id) => !trackedItemIds.has(id));
      if (untracked.length > 0) {
        const names = await db("inventory_items").whereIn("id", untracked).pluck("name");
        res.status(400).json({
          error: `Not tracked at ${location?.name || `location #${ticket.location_id}`}: ${names.join(", ")}. Add it to inventory there first.`
        });
        return;
      }

      for (const usage of itemsUsed) {
        const result = await logTicketPart({
          ticketId: ticket.id,
          itemId: usage.item_id,
          locationId: ticket.location_id,
          quantity: usage.quantity,
          notes: usage.notes || null,
          userId: req.user!.id
        });
        if (result?.crossedBelowThreshold) {
          const item = await db("inventory_items").where({ id: usage.item_id }).first("name", "unit");
          await notifyLowStock({
            itemName: item?.name || `item #${usage.item_id}`,
            unit: item?.unit || "each",
            locationName: location?.name || `location #${ticket.location_id}`,
            quantityAfter: result.quantityOnHand,
            threshold: result.reorderThreshold
          });
        }
      }
    }

    const parts = await listTicketParts(ticket.id);
    res.json({ ...ticket, parts });
  }
);

// Correct a previously-logged quantity in place (e.g. "1" typo'd instead of "6") without
// creating a second usage entry for the same item — location/ticket scoping matches /:id/status
// above since this is the same admin-gated inventory-logging action, just editing instead of adding.
ticketsRouter.patch(
  "/:id/parts/:partId",
  requireAdmin,
  body("quantity").isInt({ min: 1 }).toInt(),
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const ticketId = Number(req.params.id);
    const partId = Number(req.params.partId);
    if (!Number.isInteger(ticketId) || !Number.isInteger(partId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const allowedIds = await getAllowedLocationIds(req.user!);
    const ticket = await db("tickets").where({ id: ticketId }).first("id", "location_id");
    if (!ticket || (allowedIds !== null && !allowedIds.includes(ticket.location_id))) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const part = await db("ticket_parts").where({ id: partId }).first();
    if (!part || part.ticket_id !== ticketId) {
      res.status(404).json({ error: "Part not found on this ticket" });
      return;
    }

    const result = await updateTicketPartQuantity(partId, req.body.quantity, req.user!.id);
    if (!result.ok) {
      res.status(404).json({ error: "Part not found on this ticket" });
      return;
    }

    if (result.crossedBelowThreshold) {
      const item = await db("inventory_items").where({ id: part.item_id }).first("name", "unit");
      const location = await db("locations").where({ id: part.location_id }).first("name");
      await notifyLowStock({
        itemName: item?.name || `item #${part.item_id}`,
        unit: item?.unit || "each",
        locationName: location?.name || `location #${part.location_id}`,
        quantityAfter: result.quantityOnHand,
        threshold: result.reorderThreshold
      });
    }

    res.json(await listTicketParts(ticketId));
  }
);

ticketsRouter.delete("/:id/parts/:partId", requireAdmin, async (req: AuthedRequest, res: Response) => {
  const ticketId = Number(req.params.id);
  const partId = Number(req.params.partId);
  if (!Number.isInteger(ticketId) || !Number.isInteger(partId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const allowedIds = await getAllowedLocationIds(req.user!);
  const ticket = await db("tickets").where({ id: ticketId }).first("id", "location_id");
  if (!ticket || (allowedIds !== null && !allowedIds.includes(ticket.location_id))) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const part = await db("ticket_parts").where({ id: partId }).first();
  if (!part || part.ticket_id !== ticketId) {
    res.status(404).json({ error: "Part not found on this ticket" });
    return;
  }

  const result = await removeTicketPart(partId, req.user!.id);
  if (!result.ok) {
    res.status(404).json({ error: "Part not found on this ticket" });
    return;
  }

  res.json(await listTicketParts(ticketId));
});

// Edit and delete are for fixing duplicate/erroneous tickets, not routine workflow
// (status changes go through /:id/status above) — admin-only.
ticketsRouter.patch(
  "/:id",
  requireAdmin,
  body("location_id").optional().isInt().toInt(),
  body("equipment_id").optional({ values: "null" }).isInt().toInt(),
  body("issue_type").optional().isIn(ISSUE_TYPES),
  body("description").optional().isString().trim().isLength({ max: 2000 }),
  body("priority").optional().isIn(["low", "normal", "high", "urgent"]),
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId)) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    const allowedIds = await getAllowedLocationIds(req.user!);

    if (req.body.location_id !== undefined) {
      const location = await db("locations").where({ id: req.body.location_id }).first();
      if (!location) {
        res.status(400).json({ error: "Unknown location" });
        return;
      }
      // A location-scoped admin may edit tickets within their scope but can't use that
      // to move a ticket into a location they aren't granted access to.
      if (allowedIds !== null && !allowedIds.includes(req.body.location_id)) {
        res.status(400).json({ error: "Unknown location" });
        return;
      }
    }

    const update: Record<string, unknown> = {};
    for (const field of ["location_id", "equipment_id", "issue_type", "priority"] as const) {
      if (req.body[field] !== undefined) update[field] = req.body[field];
    }
    if (req.body.description !== undefined) update.description = req.body.description;

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    let updateQuery = db("tickets").where({ id: ticketId });
    if (allowedIds !== null) {
      updateQuery = updateQuery.whereIn("location_id", allowedIds);
    }
    const [ticket] = await updateQuery.update(update).returning("*");
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    res.json(ticket);
  }
);

ticketsRouter.delete("/:id", requireAdmin, async (req: AuthedRequest, res: Response) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId)) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  const allowedIds = await getAllowedLocationIds(req.user!);
  let deleteQuery = db("tickets").where({ id: ticketId });
  if (allowedIds !== null) {
    deleteQuery = deleteQuery.whereIn("location_id", allowedIds);
  }
  const deleted = await deleteQuery.del();
  if (!deleted) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.status(204).send();
});
