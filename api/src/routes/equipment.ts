import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { db } from "../db";
import { requireAuth, requireAdmin } from "../middleware/auth";

export const equipmentRouter = Router();

equipmentRouter.use(requireAuth);

equipmentRouter.get("/", async (_req, res) => {
  const equipment = await db("equipment").select("*").orderBy("name");
  res.json(equipment);
});

equipmentRouter.post(
  "/",
  requireAdmin,
  body("location_id").isInt(),
  body("name").isString().trim().isLength({ min: 1, max: 200 }),
  body("category").optional().isString().trim().isLength({ max: 100 }),
  body("install_date").optional().isISO8601(),
  body("notes").optional().isString().trim().isLength({ max: 2000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }
    const [equipment] = await db("equipment").insert(req.body).returning("*");
    res.status(201).json(equipment);
  }
);

equipmentRouter.patch(
  "/:id",
  requireAdmin,
  body("name").optional().isString().trim().isLength({ min: 1, max: 200 }),
  body("category").optional().isString().trim().isLength({ max: 100 }),
  body("install_date").optional().isISO8601(),
  body("notes").optional().isString().trim().isLength({ max: 2000 }),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }
    const equipmentId = Number(req.params.id);
    if (!Number.isInteger(equipmentId)) {
      res.status(400).json({ error: "Invalid equipment id" });
      return;
    }
    const [equipment] = await db("equipment").where({ id: equipmentId }).update(req.body).returning("*");
    if (!equipment) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }
    res.json(equipment);
  }
);
