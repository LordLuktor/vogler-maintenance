import { Router, Request, Response } from "express";
import { body, query, validationResult } from "express-validator";
import { db } from "../db";
import { requireAuth, requireAdmin } from "../middleware/auth";

export const locationsRouter = Router();

// Public: needed so the QR-linked report form can populate a location dropdown / label without login.
// Vehicle-type locations (trucks, etc.) are hidden by default — nobody reports a maintenance
// issue "at" a truck the way they would a store, and there may be several of these over time.
// Admin screens that manage vehicles directly (PM schedules, inventory, dashboards) pass
// include_vehicles=true to see the full list.
locationsRouter.get(
  "/",
  query("include_vehicles").optional().isBoolean().toBoolean(),
  async (req: Request, res: Response) => {
    let locationsQuery = db("locations").select("id", "name", "type").orderBy("name");
    if (!req.query.include_vehicles) {
      locationsQuery = locationsQuery.whereNot({ type: "vehicle" });
    }
    res.json(await locationsQuery);
  }
);

locationsRouter.get("/:id/equipment", async (req, res) => {
  const locationId = Number(req.params.id);
  if (!Number.isInteger(locationId)) {
    res.status(400).json({ error: "Invalid location id" });
    return;
  }
  const equipment = await db("equipment").where({ location_id: locationId }).select("id", "name", "category");
  res.json(equipment);
});

locationsRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  body("name").isString().trim().isLength({ min: 1, max: 200 }),
  body("type").isString().trim().isLength({ min: 1, max: 50 }),
  body("address").optional().isString().trim().isLength({ max: 300 }),
  body("contact_name").optional().isString().trim().isLength({ max: 200 }),
  body("contact_phone").optional().isString().trim().isLength({ max: 30 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }
    const [location] = await db("locations").insert(req.body).returning("*");
    res.status(201).json(location);
  }
);

locationsRouter.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  body("name").optional().isString().trim().isLength({ min: 1, max: 200 }),
  body("type").optional().isString().trim().isLength({ min: 1, max: 50 }),
  body("address").optional().isString().trim().isLength({ max: 300 }),
  body("contact_name").optional().isString().trim().isLength({ max: 200 }),
  body("contact_phone").optional().isString().trim().isLength({ max: 30 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }
    const locationId = Number(req.params.id);
    if (!Number.isInteger(locationId)) {
      res.status(400).json({ error: "Invalid location id" });
      return;
    }
    const [location] = await db("locations").where({ id: locationId }).update(req.body).returning("*");
    if (!location) {
      res.status(404).json({ error: "Location not found" });
      return;
    }
    res.json(location);
  }
);
