import cron from "node-cron";
import { db } from "../db";
import { notifyNewTicket } from "./notify";

async function checkDueSchedules(): Promise<void> {
  const due = await db("pm_schedules")
    .where("active", true)
    .whereNull("current_ticket_id")
    .andWhere("next_due_at", "<=", db.fn.now());

  for (const schedule of due) {
    const [ticket] = await db("tickets")
      .insert({
        location_id: schedule.location_id,
        equipment_id: schedule.equipment_id,
        issue_type: schedule.issue_type,
        description: `Preventive maintenance due: ${schedule.title}`,
        priority: schedule.priority,
        source: "pm"
      })
      .returning("*");

    await db("pm_schedules").where({ id: schedule.id }).update({ current_ticket_id: ticket.id });
    await notifyNewTicket(ticket);
  }
}

// Runs once a day — PM due-dates are day-granularity, no need for finer-grained polling.
export function startPmScheduler(): void {
  cron.schedule("0 7 * * *", () => {
    checkDueSchedules().catch((err) => console.error("[pm-scheduler] due-check failed:", err));
  });
}

export { checkDueSchedules };
