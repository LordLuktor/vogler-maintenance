import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../db";

// One-time bootstrap for Scott's dashboard login: npx tsx src/scripts/create-admin.ts <email> <password> [name]
async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error("Usage: create-admin.ts <email> <password (min 8 chars)> [name]");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db("users")
    .insert({ email, password_hash: passwordHash, name: name || null })
    .onConflict("email")
    .merge({ password_hash: passwordHash, name: name || null })
    .returning(["id", "email"]);

  console.log(`Admin user ready: ${user.email} (id ${user.id})`);
  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
