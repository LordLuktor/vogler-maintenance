import { db } from "../db";
import { sendAlertEmail } from "./email";

const ALERT_EMAIL = process.env.ALERT_EMAIL || "scott@steinmetz.ltd";
const RECEIPTS_ALERT_EMAIL = process.env.RECEIPTS_ALERT_EMAIL || "jblessing@voglerford.com";

interface NewTicket {
  id: number;
  location_id: number;
  issue_type: string;
  description: string;
  priority: string;
}

function formatIssueType(issueType: string): string {
  return issueType.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// SMS (Twilio) alerting is a later addition — email is the only channel for now.
export async function notifyNewTicket(ticket: NewTicket): Promise<void> {
  const location = await db("locations").where({ id: ticket.location_id }).first("name");
  const locationName = location?.name || `location #${ticket.location_id}`;

  const subject = `[${ticket.priority.toUpperCase()}] New ticket #${ticket.id} — ${locationName} — ${formatIssueType(ticket.issue_type)}`;
  const text = `${locationName} reported a ${formatIssueType(ticket.issue_type)} issue:\n\n${
    ticket.description || "(no additional notes)"
  }\n\nPriority: ${ticket.priority}\n\nView it: ${
    process.env.PUBLIC_APP_URL || "http://localhost:5173"
  }/tickets/${ticket.id}`;

  try {
    await sendAlertEmail(ALERT_EMAIL, subject, text);
  } catch (err) {
    // A notification failure must never block ticket creation — the ticket is already
    // saved and visible on the dashboard even if the alert email doesn't go out.
    console.error(`[notify] failed to send alert for ticket #${ticket.id}:`, err);
  }
}

interface UpdatedTicket {
  id: number;
  location_id: number;
  issue_type: string;
  status: string;
  status_notes?: string | null;
  reporter_email?: string | null;
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Only fires when the reporter opted in by leaving an email address — no address, no email.
export async function notifyTicketStatusChange(ticket: UpdatedTicket): Promise<void> {
  if (!ticket.reporter_email) return;

  const location = await db("locations").where({ id: ticket.location_id }).first("name");
  const locationName = location?.name || `location #${ticket.location_id}`;

  const subject = `Update on your ticket #${ticket.id} — ${locationName} — ${formatStatus(ticket.status)}`;
  const notesLine = ticket.status_notes ? `\n\nNote from maintenance:\n${ticket.status_notes}` : "";
  // No dashboard link here — reporters aren't logged in, so a /tickets/:id link would just
  // bounce them to a login wall.
  const text = `Your ${formatIssueType(ticket.issue_type)} report at ${locationName} is now: ${formatStatus(
    ticket.status
  )}${notesLine}`;

  try {
    await sendAlertEmail(ticket.reporter_email, subject, text);
  } catch (err) {
    console.error(`[notify] failed to send status update for ticket #${ticket.id}:`, err);
  }
}

interface NewReceipt {
  id: number;
  uploaded_by: number;
  items: { description: string; amount?: number }[];
  file_count: number;
}

function formatAmount(amount: number | string | null | undefined): string {
  return amount != null ? `$${Number(amount).toFixed(2)}` : "no amount listed";
}

export async function notifyNewReceipt(receipt: NewReceipt): Promise<void> {
  const uploader = await db("users").where({ id: receipt.uploaded_by }).first("name", "email");
  const uploaderName = uploader?.name || uploader?.email || "Unknown";

  const subject = `New receipt uploaded — ${uploaderName}`;
  const itemLines = receipt.items.map((item) => `- ${item.description} (${formatAmount(item.amount)})`).join("\n");
  const text = `${uploaderName} uploaded a receipt with ${receipt.items.length} item${
    receipt.items.length === 1 ? "" : "s"
  } and ${receipt.file_count} attached file${receipt.file_count === 1 ? "" : "s"}:\n\n${itemLines}\n\nView it: ${
    process.env.PUBLIC_APP_URL || "http://localhost:5173"
  }/receipts`;

  try {
    await sendAlertEmail(RECEIPTS_ALERT_EMAIL, subject, text);
  } catch (err) {
    console.error(`[notify] failed to send new-receipt alert for receipt #${receipt.id}:`, err);
  }
}

interface ReturnedReceiptItem {
  receiptId: number;
  itemId: number;
  description: string;
  amount: number | string | null;
  returnedBy: number;
}

// Fired only on the not-returned -> returned transition (see routes/receipts.ts) so
// toggling an item back off and on again doesn't re-send the alert.
export async function notifyReceiptItemReturned(item: ReturnedReceiptItem): Promise<void> {
  const user = await db("users").where({ id: item.returnedBy }).first("name", "email");
  const userName = user?.name || user?.email || "Unknown";

  const subject = `Return marked — receipt #${item.receiptId} — ${item.description}`;
  const text = `${userName} marked an item as returned on receipt #${item.receiptId}:\n\n${item.description} (${formatAmount(
    item.amount
  )})\n\nView it: ${process.env.PUBLIC_APP_URL || "http://localhost:5173"}/receipts`;

  try {
    await sendAlertEmail(RECEIPTS_ALERT_EMAIL, subject, text);
  } catch (err) {
    console.error(`[notify] failed to send return alert for receipt #${item.receiptId} item #${item.itemId}:`, err);
  }
}
