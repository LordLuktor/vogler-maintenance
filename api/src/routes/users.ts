import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { requireAuth, requireAdmin, AuthedRequest } from "../middleware/auth";
import { sendPasswordSetupLink } from "../services/passwordReset";

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.use(requireAdmin);

usersRouter.get("/", async (_req, res) => {
  const users = await db("users").select("id", "email", "name", "is_admin", "all_locations", "can_view_receipts");
  const locationRows = await db("user_locations as ul")
    .join("locations as l", "l.id", "ul.location_id")
    .select("ul.user_id", "l.id as location_id", "l.name as location_name");

  const locationsByUser = new Map<number, { id: number; name: string }[]>();
  for (const row of locationRows) {
    const list = locationsByUser.get(row.user_id) || [];
    list.push({ id: row.location_id, name: row.location_name });
    locationsByUser.set(row.user_id, list);
  }

  res.json(users.map((u) => ({ ...u, locations: locationsByUser.get(u.id) || [] })));
});

usersRouter.post(
  "/",
  body("email").isEmail().trim(),
  body("name").optional().isString().trim().isLength({ max: 200 }),
  // Admin-set initial password is optional — when omitted we fall back to the invite-link
  // flow below, same as before this field existed.
  body("password").optional().isString().isLength({ min: 8 }),
  body("is_admin").optional().isBoolean().toBoolean(),
  body("all_locations").optional().isBoolean().toBoolean(),
  body("can_view_receipts").optional().isBoolean().toBoolean(),
  body("location_ids").optional().isArray(),
  body("location_ids.*").isInt().toInt(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const existing = await db("users").where({ email: req.body.email }).first();
    if (existing) {
      res.status(400).json({ error: "A user with that email already exists" });
      return;
    }

    // If the admin supplied a password, use it directly — the user can log in with it
    // right away and change it themselves afterward via the normal forgot-password flow.
    // Otherwise fall back to the old behavior: a random, immediately-discarded hash fills
    // the NOT NULL column, and the invite email's reset-token flow is the only way to set
    // a real one.
    const password: string | undefined = req.body.password;
    const passwordHash = password
      ? await bcrypt.hash(password, 12)
      : await bcrypt.hash(randomBytes(32).toString("hex"), 12);

    const [user] = await db("users")
      .insert({
        email: req.body.email,
        name: req.body.name || null,
        password_hash: passwordHash,
        is_admin: req.body.is_admin || false,
        all_locations: req.body.all_locations || false,
        can_view_receipts: req.body.can_view_receipts || false
      })
      .returning("*");

    const locationIds: number[] = req.body.location_ids || [];
    if (!user.all_locations && locationIds.length > 0) {
      await db("user_locations").insert(locationIds.map((location_id) => ({ user_id: user.id, location_id })));
    }

    if (!password) {
      await sendPasswordSetupLink(user.id, user.email, "invite");
    }

    res.status(201).json({ id: user.id, email: user.email });
  }
);

usersRouter.patch(
  "/:id",
  body("name").optional().isString().trim().isLength({ max: 200 }),
  body("is_admin").optional().isBoolean().toBoolean(),
  body("all_locations").optional().isBoolean().toBoolean(),
  body("can_view_receipts").optional().isBoolean().toBoolean(),
  body("location_ids").optional().isArray(),
  body("location_ids.*").isInt().toInt(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input", details: errors.array() });
      return;
    }

    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    const target = await db("users").where({ id: userId }).first();
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (target.is_admin && req.body.is_admin === false) {
      const otherAdmins = await db("users").where({ is_admin: true }).andWhereNot({ id: userId }).count("* as count").first();
      if (Number(otherAdmins?.count || 0) === 0) {
        res.status(400).json({ error: "Can't remove the last remaining admin" });
        return;
      }
    }

    const allowed = ["name", "is_admin", "all_locations", "can_view_receipts"] as const;
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (Object.keys(update).length > 0) {
      await db("users").where({ id: userId }).update(update);
    }

    if (req.body.location_ids !== undefined) {
      await db("user_locations").where({ user_id: userId }).del();
      const locationIds: number[] = req.body.location_ids;
      if (locationIds.length > 0) {
        await db("user_locations").insert(locationIds.map((location_id) => ({ user_id: userId, location_id })));
      }
    }

    const updated = await db("users")
      .where({ id: userId })
      .first("id", "email", "name", "is_admin", "all_locations", "can_view_receipts");
    res.json(updated);
  }
);

usersRouter.delete("/:id", async (req: AuthedRequest, res: Response) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  if (userId === req.user?.id) {
    res.status(400).json({ error: "You can't delete your own account" });
    return;
  }

  const target = await db("users").where({ id: userId }).first();
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (target.is_admin) {
    const otherAdmins = await db("users").where({ is_admin: true }).andWhereNot({ id: userId }).count("* as count").first();
    if (Number(otherAdmins?.count || 0) === 0) {
      res.status(400).json({ error: "Can't remove the last remaining admin" });
      return;
    }
  }

  await db("users").where({ id: userId }).del();
  res.json({ ok: true });
});
