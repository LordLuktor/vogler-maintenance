import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { jwtSecret } from "../middleware/auth";
import { sendPasswordSetupLink } from "../services/passwordReset";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

// Same limiter shape as login — this endpoint is unauthenticated by nature (that's the point
// of a password reset), so it needs its own abuse guard rather than reusing loginLimiter's state.
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false
});

authRouter.post(
  "/login",
  loginLimiter,
  // No .normalizeEmail() — it silently rewrites Gmail addresses (strips dots, since Gmail
  // treats "a.b@gmail.com" and "ab@gmail.com" as the same mailbox), which breaks lookups
  // against whatever literal address is actually stored for the account.
  body("email").isEmail().trim(),
  body("password").isString().isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const { email, password } = req.body as { email: string; password: string };
    const user = await db("users").where({ email }).first();
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ sub: user.id }, jwtSecret(), { expiresIn: "12h" });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_admin: user.is_admin,
        all_locations: user.all_locations,
        can_view_receipts: user.can_view_receipts
      }
    });
  }
);

authRouter.post(
  "/forgot-password",
  resetLimiter,
  // No .normalizeEmail() — it silently rewrites Gmail addresses (strips dots, since Gmail
  // treats "a.b@gmail.com" and "ab@gmail.com" as the same mailbox), which breaks lookups
  // against whatever literal address is actually stored for the account.
  body("email").isEmail().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const { email } = req.body as { email: string };
    const user = await db("users").where({ email }).first();

    // Always respond the same way whether or not the account exists, so this endpoint
    // can't be used to enumerate valid email addresses.
    if (user) {
      await sendPasswordSetupLink(user.id, user.email, "reset");
    }

    res.json({ ok: true });
  }
);

authRouter.post(
  "/reset-password",
  resetLimiter,
  body("token").isString().isLength({ min: 1 }),
  body("password").isString().isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const { token, password } = req.body as { token: string; password: string };
    const user = await db("users")
      .where({ reset_token: token })
      .andWhere("reset_token_expires_at", ">", db.fn.now())
      .first();

    if (!user) {
      res.status(400).json({ error: "This reset link is invalid or has expired" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db("users")
      .where({ id: user.id })
      .update({ password_hash: passwordHash, reset_token: null, reset_token_expires_at: null });

    res.json({ ok: true });
  }
);
