import { randomBytes } from "crypto";
import { db } from "../db";
import { sendAlertEmail } from "./email";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Shared by /forgot-password and new-user invites — both are "here's a link to set a
// password" with identical mechanics, just different copy.
export async function sendPasswordSetupLink(
  userId: number,
  email: string,
  kind: "reset" | "invite"
): Promise<void> {
  // Short enough to copy/type reliably — a 64-char hex token was proven to get truncated
  // in transit (terminal line-wrapping). Safe at this length given the 1-hour expiry and
  // the endpoint's 5-attempts/15-min rate limit.
  const token = randomBytes(6).toString("hex");
  await db("users")
    .where({ id: userId })
    .update({ reset_token: token, reset_token_expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS) });

  const resetUrl = `${process.env.PUBLIC_APP_URL || "http://localhost:5173"}/reset-password?token=${token}`;

  const subject = kind === "invite" ? "Set up your Vogler Maintenance account" : "Reset your Vogler Maintenance password";
  const text =
    kind === "invite"
      ? `You've been added to Vogler Maintenance. Click the link below to set your password and log in. This link expires in 1 hour.\n\n${resetUrl}`
      : `Click the link below to set a new password. This link expires in 1 hour.\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`;

  await sendAlertEmail(email, subject, text).catch((err) =>
    console.error(`[auth] failed to send ${kind} email:`, err)
  );
}
