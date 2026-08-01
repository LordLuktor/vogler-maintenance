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
