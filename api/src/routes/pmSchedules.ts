import { Router, Response } from "express";
import { body, validationResult } from "express-validator";
import { db } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { ISSUE_TYPES } from "../issueTypes";
import { completeSchedule } from "../services/pmSchedules";
import { getAllowedLocationIds } from "../services/permissions";
import { adjustStock } from "../services/inventory";
import { notifyLowStock } from "../services/inventoryAlerts";

export const pmSchedulesRouter = Router();

pmSchedulesRouter.use(requireAuth);

pmSchedulesRouter.get("/", async (req: AuthedRequest, res: Response) => {
  const allowedIds = await getAllowedLocationIds(req.user!);

  let schedulesQuery = db("pm_schedules as p")
    .join("locations as l", "l.id", "p.location_id")
    .leftJoin("equipment as e", "e.id", "p.equipment_id")
    .select("p.*", "l.name as location_name", "e.name as equipment_name")
    .orderBy("p.next_due_at", "asc");

  if (allowedIds !== null) {
    schedulesQuery = schedulesQuery.whereIn("p.location_id", allowedIds);
  }

  res.json(await schedulesQuery);
});

pmSchedulesRouter.post(
  "/",
  body("location_id").isInt().toInt(),
  body("equipment_id").optional({ values: "falsy" }).isInt().toInt(),
  body("title").isString().trim().isLength({ min: 1, max: 200 }),
  body("issue_type").isIn(ISSUE_TYPES),
  body("priority").optional().isIn(["low", "normal", "high", "urgent"]),
  body("interval_days").isInt({ min: 1 }).toInt(),
  body("next_due_at").isISO8601(),
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const allowedIds = await getAllowedLocationIds(req.user!);
    if (allowedIds !== null && !allowedIds.includes(req.body.location_id)) {
      res.status(403).json({ error: "You don't have access to that location" });
      return;
    }

    const [schedule] = await db("pm_schedules")
      .insert({
        location_id: req.body.location_id,
        equipment_id: req.body.equipment_id || null,
        title: req.body.title,
        issue_type: req.body.issue_type,
        priority: req.body.priority || "normal",
        interval_days: req.body.interval_days,
        next_due_at: req.body.next_due_at
      })
      .returning("*");

    res.status(201).json(schedule);
  }
);

pmSchedulesRouter.patch(
  "/:id",
  body("active").optional().isBoolean().toBoolean(),
  body("title").optional().isString().trim().isLength({ min: 1, max: 200 }),
  body("interval_days").optional().isInt({ min: 1 }).toInt(),
  body("priority").optional().isIn(["low", "normal", "high", "urgent"]),
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const scheduleId = Number(req.params.id);
    if (!Number.isInteger(scheduleId)) {
      res.status(400).json({ error: "Invalid schedule id" });
      return;
    }

    const allowed = ["active", "title", "interval_days", "priority"] as const;
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const allowedIds = await getAllowedLocationIds(req.user!);
    let updateQuery = db("pm_schedules").where({ id: scheduleId });
    if (allowedIds !== null) {
      updateQuery = updateQuery.whereIn("location_id", allowedIds);
    }
    const [schedule] = await updateQuery.update(update).returning("*");
    if (!schedule) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }
    res.json(schedule);
  }
);

pmSchedulesRouter.post(
  "/:id/complete",
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
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

    const scheduleId = Number(req.params.id);
    if (!Number.isInteger(scheduleId)) {
      res.status(400).json({ error: "Invalid schedule id" });
      return;
    }

    const allowedIds = await getAllowedLocationIds(req.user!);
    let scheduleQuery = db("pm_schedules").where({ id: scheduleId });
    if (allowedIds !== null) {
      scheduleQuery = scheduleQuery.whereIn("location_id", allowedIds);
    }
    const schedule = await scheduleQuery.first();
    if (!schedule) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }

    // If the cron already opened a ticket for this cycle, close it out too so it doesn't
    // linger on the dashboard after the underlying PM task has been marked done here.
    if (schedule.current_ticket_id) {
      await db("tickets")
        .where({ id: schedule.current_ticket_id })
        .update({ status: "done", resolved_at: db.fn.now() });
    }

    await completeSchedule(scheduleId, { ticketId: schedule.current_ticket_id, notes: req.body.notes || null });

    if (itemsUsed.length > 0) {
      const location = await db("locations").where({ id: schedule.location_id }).first("name");
      for (const usage of itemsUsed) {
        const result = await adjustStock({
          itemId: usage.item_id,
          locationId: schedule.location_id,
          delta: -usage.quantity,
          reason: "pm_use",
          pmScheduleId: scheduleId,
          ticketId: schedule.current_ticket_id ?? null,
          userId: req.user!.id,
          notes: usage.notes || null
        });
        if (result?.crossedBelowThreshold) {
          const item = await db("inventory_items").where({ id: usage.item_id }).first("name", "unit");
          await notifyLowStock({
            itemName: item?.name || `item #${usage.item_id}`,
            unit: item?.unit || "each",
            locationName: location?.name || `location #${schedule.location_id}`,
            quantityAfter: result.stock.quantity_on_hand,
            threshold: result.stock.reorder_threshold
          });
        }
      }
    }

    const updated = await db("pm_schedules").where({ id: scheduleId }).first();
    res.json(updated);
  }
);
