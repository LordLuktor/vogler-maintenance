import { db } from "../db";
import { AuthedUser } from "../middleware/auth";

// null means "no restriction" (all_locations); otherwise the exact set of location ids
// this user may see. An empty array (all_locations false, no assignments) is intentional —
// fail closed, not open, for a user nobody has granted any location to yet.
export async function getAllowedLocationIds(user: AuthedUser): Promise<number[] | null> {
  if (user.all_locations) return null;
  const rows = await db("user_locations").where({ user_id: user.id }).select("location_id");
  return rows.map((r) => r.location_id);
}
