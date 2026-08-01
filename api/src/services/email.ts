import nodemailer from "nodemailer";
import { readSecret } from "../secrets";

function smtpPassword(): string {
  return readSecret("vogler_smtp_password", "SMTP_PASSWORD");
}

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.purelymail.com",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || "maintenance@steinmetz.ltd",
    pass: smtpPassword()
  }
});

const FROM = `Vogler Maintenance <${process.env.SMTP_USER || "maintenance@steinmetz.ltd"}>`;

export async function sendAlertEmail(to: string, subject: string, text: string): Promise<void> {
  // Sets Importance/X-Priority/X-MSMail-Priority headers — most clients surface these as a
  // high-priority indicator, though Gmail's web UI doesn't visually honor them on its own
  // (a Gmail-side filter to star/label mail from this address is the reliable fix there).
  await transport.sendMail({ from: FROM, to, subject, text, priority: "high" });
}
