import { db } from "../db";
import { sendAlertEmail } from "./email";

const ALERT_EMAIL = process.env.ALERT_EMAIL || "scott@steinmetz.ltd";

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
