import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { db } from "../db";
import { requireAuth, requireAdmin } from "../middleware/auth";

export const assetsRouter = Router();

assetsRouter.use(requireAuth);
assetsRouter.use(requireAdmin);

function listAssetsQuery() {
  return db("assets as a")
    .join("locations as home", "home.id", "a.home_location_id")
    .join("locations as current", "current.id", "a.current_location_id")
    .select(
      "a.*",
      "home.name as home_location_name",
      "current.name as current_location_name"
    )
    .orderBy("a.name");
}

assetsRouter.get("/", async (_req: Request, res: Response) => {
  res.json(await listAssetsQuery());
});

assetsRouter.post(
  "/",
  body("name").isString().trim().isLength({ min: 1, max: 200 }),
  body("home_location_id").isInt().toInt(),
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const [asset] = await db("assets")
      .insert({
        name: req.body.name,
        home_location_id: req.body.home_location_id,
        current_location_id: req.body.home_location_id,
        notes: req.body.notes || null
      })
      .returning("*");

    res.status(201).json(asset);
  }
);

assetsRouter.patch(
  "/:id",
  body("name").optional().isString().trim().isLength({ min: 1, max: 200 }),
  body("home_location_id").optional().isInt().toInt(),
  body("current_location_id").optional().isInt().toInt(),
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const assetId = Number(req.params.id);
    if (!Number.isInteger(assetId)) {
      res.status(400).json({ error: "Invalid asset id" });
      return;
    }

    const allowed = ["name", "home_location_id", "current_location_id", "notes"] as const;
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const [updated] = await db("assets").where({ id: assetId }).update(update).returning("*");
    if (!updated) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }
    res.json(updated);
  }
);

assetsRouter.delete("/:id", async (req: Request, res: Response) => {
  const assetId = Number(req.params.id);
  if (!Number.isInteger(assetId)) {
    res.status(400).json({ error: "Invalid asset id" });
    return;
  }

  await db("assets").where({ id: assetId }).del();
  res.json({ ok: true });
});
