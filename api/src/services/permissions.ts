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

// Read-only scope for viewing tickets. Receipts reviewers need to look up any ticket a
// purchase was made for, regardless of location, but get no write access from this —
// every mutating ticket route still checks getAllowedLocationIds() above.
export async function getReadableLocationIds(user: AuthedUser): Promise<number[] | null> {
  if (user.can_view_receipts) return null;
  return getAllowedLocationIds(user);
}
