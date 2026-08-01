import { Router, Request, Response } from "express";
import { body, query, validationResult } from "express-validator";
import { db } from "../db";
import { requireAuth, requireAdmin, AuthedRequest } from "../middleware/auth";
import { adjustStock, listItems, listStock, listTransactions } from "../services/inventory";
import { notifyLowStock } from "../services/inventoryAlerts";
import { lookupUpc } from "../services/upcLookup";

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);
inventoryRouter.use(requireAdmin);

inventoryRouter.get("/items", query("include_inactive").optional().isBoolean().toBoolean(), async (req: Request, res: Response) => {
  const items = await listItems(Boolean(req.query.include_inactive));
  res.json(items);
});

inventoryRouter.post(
  "/items",
  body("name").isString().trim().isLength({ min: 1, max: 200 }),
  body("unit").optional().isString().trim().isLength({ min: 1, max: 30 }),
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
  body("part_number").optional({ values: "falsy" }).isString().trim().isLength({ max: 100 }),
  body("barcode").optional({ values: "falsy" }).isString().trim().isLength({ max: 100 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    if (req.body.barcode) {
      const existing = await db("inventory_items").where({ barcode: req.body.barcode }).first();
      if (existing) {
        res.status(400).json({ error: "That barcode is already used by another item" });
        return;
      }
    }

    const [item] = await db("inventory_items")
      .insert({
        name: req.body.name,
        unit: req.body.unit || "each",
        notes: req.body.notes || null,
        part_number: req.body.part_number || null,
        barcode: req.body.barcode || null
      })
      .returning("*");

    res.status(201).json(item);
  }
);

// Barcode lookups are declared before /items/:id so "lookup"/"external-lookup" never get
// swallowed as an :id param — Express matches literal segments in declaration order.
inventoryRouter.get(
  "/items/lookup",
  query("barcode").isString().trim().isLength({ min: 1, max: 100 }),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const item = await db("inventory_items").where({ barcode: req.query.barcode as string }).first();
    if (!item) {
      res.status(404).json({ error: "No catalog item has that barcode" });
      return;
    }
    res.json(item);
  }
);

inventoryRouter.get(
  "/items/external-lookup",
  query("barcode").isString().trim().isLength({ min: 1, max: 100 }),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const result = await lookupUpc(req.query.barcode as string);
    res.json(result);
  }
);

inventoryRouter.patch(
  "/items/:id",
  body("name").optional().isString().trim().isLength({ min: 1, max: 200 }),
  body("unit").optional().isString().trim().isLength({ min: 1, max: 30 }),
  body("notes").optional({ values: "null" }).isString().trim().isLength({ max: 1000 }),
  body("part_number").optional({ values: "null" }).isString().trim().isLength({ max: 100 }),
  body("barcode").optional({ values: "null" }).isString().trim().isLength({ max: 100 }),
  body("active").optional().isBoolean().toBoolean(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId)) {
      res.status(400).json({ error: "Invalid item id" });
      return;
    }

    if (req.body.barcode) {
      const existing = await db("inventory_items")
        .where({ barcode: req.body.barcode })
        .whereNot({ id: itemId })
        .first();
      if (existing) {
        res.status(400).json({ error: "That barcode is already used by another item" });
        return;
      }
    }

    const allowed = ["name", "unit", "notes", "part_number", "barcode", "active"] as const;
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const [item] = await db("inventory_items").where({ id: itemId }).update(update).returning("*");
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    res.json(item);
  }
);

inventoryRouter.get(
  "/stock",
  query("location_id").optional().isInt().toInt(),
  query("item_id").optional().isInt().toInt(),
  async (req: Request, res: Response) => {
    const stock = await listStock({
      locationId: req.query.location_id as unknown as number,
      itemId: req.query.item_id as unknown as number
    });
    res.json(stock);
  }
);

inventoryRouter.post(
  "/stock",
  body("item_id").isInt().toInt(),
  body("location_id").isInt().toInt(),
  body("reorder_threshold").optional().isInt({ min: 0 }).toInt(),
  body("quantity_on_hand").optional().isInt({ min: 0 }).toInt(),
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const existing = await db("inventory_stock")
      .where({ item_id: req.body.item_id, location_id: req.body.location_id })
      .first();
    if (existing) {
      res.status(400).json({ error: "That item is already tracked at this location" });
      return;
    }

    const quantityOnHand = req.body.quantity_on_hand ?? 0;
    const reorderThreshold = req.body.reorder_threshold ?? 0;

    const [stock] = await db("inventory_stock")
      .insert({
        item_id: req.body.item_id,
        location_id: req.body.location_id,
        quantity_on_hand: quantityOnHand,
        reorder_threshold: reorderThreshold
      })
      .returning("*");

    if (quantityOnHand > 0) {
      await db("inventory_transactions").insert({
        item_id: req.body.item_id,
        location_id: req.body.location_id,
        quantity_delta: quantityOnHand,
        quantity_after: quantityOnHand,
        reason: "restock",
        user_id: req.user!.id,
        notes: "Starting count when tracking began"
      });
    }

    // No alert here even if starting below threshold — there's no prior "above threshold"
    // state to cross down from yet, so this would just be noise on every new low-count item.

    res.status(201).json(stock);
  }
);

inventoryRouter.patch(
  "/stock/:id",
  body("reorder_threshold").isInt({ min: 0 }).toInt(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const stockId = Number(req.params.id);
    if (!Number.isInteger(stockId)) {
      res.status(400).json({ error: "Invalid stock id" });
      return;
    }

    const [stock] = await db("inventory_stock")
      .where({ id: stockId })
      .update({ reorder_threshold: req.body.reorder_threshold })
      .returning("*");
    if (!stock) {
      res.status(404).json({ error: "Stock record not found" });
      return;
    }
    res.json(stock);
  }
);

inventoryRouter.post(
  "/stock/:id/adjust",
  body("quantity_delta").isInt().toInt().custom((value) => value !== 0),
  body("reason").isIn(["restock", "manual_adjustment"]),
  body("notes").optional().isString().trim().isLength({ max: 500 }),
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const stockId = Number(req.params.id);
    if (!Number.isInteger(stockId)) {
      res.status(400).json({ error: "Invalid stock id" });
      return;
    }

    const stockRow = await db("inventory_stock as s")
      .join("inventory_items as i", "i.id", "s.item_id")
      .join("locations as l", "l.id", "s.location_id")
      .select("s.*", "i.name as item_name", "i.unit as item_unit", "l.name as location_name")
      .where("s.id", stockId)
      .first();
    if (!stockRow) {
      res.status(404).json({ error: "Stock record not found" });
      return;
    }

    const result = await adjustStock({
      itemId: stockRow.item_id,
      locationId: stockRow.location_id,
      delta: req.body.quantity_delta,
      reason: req.body.reason,
      userId: req.user!.id,
      notes: req.body.notes || null
    });

    if (result?.crossedBelowThreshold) {
      await notifyLowStock({
        itemName: stockRow.item_name,
        unit: stockRow.item_unit,
        locationName: stockRow.location_name,
        quantityAfter: result.stock.quantity_on_hand,
        threshold: result.stock.reorder_threshold
      });
    }

    res.json({ ...stockRow, quantity_on_hand: result!.stock.quantity_on_hand });
  }
);

inventoryRouter.get(
  "/transactions",
  query("location_id").optional().isInt().toInt(),
  query("item_id").optional().isInt().toInt(),
  query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
  async (req: Request, res: Response) => {
    const transactions = await listTransactions({
      locationId: req.query.location_id as unknown as number,
      itemId: req.query.item_id as unknown as number,
      limit: req.query.limit as unknown as number
    });
    res.json(transactions);
  }
);
