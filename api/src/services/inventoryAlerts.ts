import { sendAlertEmail } from "./email";

const ALERT_EMAIL = process.env.ALERT_EMAIL || "scott@steinmetz.ltd";

interface LowStockArgs {
  itemName: string;
  unit: string;
  locationName: string;
  quantityAfter: number;
  threshold: number;
}

export async function notifyLowStock(args: LowStockArgs): Promise<void> {
  const subject = `Low stock: ${args.itemName} at ${args.locationName}`;
  const text = `${args.locationName} is running low on ${args.itemName}.\n\nOn hand: ${args.quantityAfter} ${args.unit}\nReorder threshold: ${args.threshold} ${args.unit}\n\nRestock when you get a chance.`;

  try {
    await sendAlertEmail(ALERT_EMAIL, subject, text);
  } catch (err) {
    // A notification failure must never block the stock adjustment that triggered it —
    // the quantity is already saved even if the alert email doesn't go out.
    console.error(`[inventoryAlerts] failed to send low-stock alert for ${args.itemName}:`, err);
  }
}
