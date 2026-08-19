import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { readSecret } from "../secrets";
import { db } from "../db";

export function jwtSecret(): string {
  return readSecret("vogler_jwt_secret", "JWT_SECRET");
}

export interface AuthedUser {
  id: number;
  is_admin: boolean;
  all_locations: boolean;
  can_view_receipts: boolean;
}

export interface AuthedRequest extends Request {
  user?: AuthedUser;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (typeof payload === "string" || typeof payload.sub !== "number") {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    // Looked up fresh on every request (not embedded in the JWT) so a permission change
    // takes effect immediately rather than waiting for the user's token to expire/refresh.
    const user = await db("users")
      .where({ id: payload.sub })
      .first("id", "is_admin", "all_locations", "can_view_receipts");
    if (!user) {
      res.status(401).json({ error: "Account no longer exists" });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// For routes that work with or without login (e.g. ticket submission, open to anonymous
// reporters) but still want to know who the caller is when they happen to be logged in.
// Never blocks — a missing, malformed, or expired token just proceeds anonymously rather
// than failing the request, since auth was never required here in the first place.
export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (typeof payload !== "string" && typeof payload.sub === "number") {
      const user = await db("users")
        .where({ id: payload.sub })
        .first("id", "is_admin", "all_locations", "can_view_receipts");
      if (user) req.user = user;
    }
  } catch {
    // Invalid/expired token on a route that doesn't require one — proceed anonymously.
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user?.is_admin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// Lets admins and the narrower "can view receipts" role both through, so a user can be
// granted read access to the receipts archive without also getting full admin rights.
export function requireReceiptsAccess(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user?.is_admin && !req.user?.can_view_receipts) {
    res.status(403).json({ error: "Receipts access required" });
    return;
  }
  next();
}
