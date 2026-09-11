import OpenAI from "openai";
import { readSecret } from "../secrets";

// Image types passed as image_url data URIs. HEIC/HEIF (which ReceiptFileCapture on the
// frontend deliberately leaves unconverted) aren't among them, so those receipts fall back
// to manual entry rather than erroring the whole upload. PDFs go through the separate
// "file" content part below instead.
const SCANNABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export class UnscannableFileError extends Error {}

let client: OpenAI | null = null;

// Built lazily (not at module load, unlike the SMTP transport in services/email.ts) so a
// missing/misconfigured key only breaks the scan endpoint, not API startup as a whole —
// this feature is a convenience on top of manual entry, not load-bearing.
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: readSecret("vogler_openai_api_key", "OPENAI_API_KEY") });
  }
  return client;
}

const SYSTEM_PROMPT =
  "You read photos and scans of purchase receipts from an auto dealership/parts group's " +
  "maintenance staff. Extract each distinct purchased line item with its price. Skip " +
  "subtotal, tax, discount, and total lines — only individual purchased items. If a price " +
  "isn't legible, use null for that item's amount rather than guessing. Fuel/gas pump " +
  "receipts print the per-gallon price with 3 decimal places (e.g. $3.459/gal); round that " +
  "to 2 decimal places (e.g. $3.46) rather than copying the third digit — this rounding " +
  "applies only to fuel per-gallon prices, not to other receipt amounts. If the image isn't " +
  "a receipt or nothing is legible, return an empty items array.";

// Matches the pump per-gallon price on fuel receipts (e.g. "Unleaded @ $3.459/gal"), which is
// the only line item type printed with 3 decimal places. Other commercial amounts (bulk unit
// pricing, fractional-cent parts pricing) are left exactly as extracted — rounding those would
// lose precision that matters for commercial reporting.
const FUEL_ITEM_PATTERN = /\b(fuel|gas(?:oline)?|unleaded|diesel|gallon|gal)\b/i;

const ITEMS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "What was purchased, as printed on the receipt line (item name, not a SKU/code alone)"
          },
          amount: {
            type: ["number", "null"],
            description: "That line's price in dollars, or null if it isn't legible"
          }
        },
        required: ["description", "amount"],
        additionalProperties: false
      }
    }
  },
  required: ["items"],
  additionalProperties: false
};

export interface ScannedItem {
  description: string;
  amount: number | null;
}

export async function scanReceiptItems(buffer: Buffer, mimeType: string): Promise<ScannedItem[]> {
  const data = buffer.toString("base64");

  let contentPart: OpenAI.Chat.Completions.ChatCompletionContentPart;
  if (mimeType === "application/pdf") {
    contentPart = { type: "file", file: { file_data: `data:application/pdf;base64,${data}`, filename: "receipt.pdf" } };
  } else if (SCANNABLE_IMAGE_TYPES.has(mimeType)) {
    contentPart = { type: "image_url", image_url: { url: `data:${mimeType};base64,${data}` } };
  } else {
    throw new UnscannableFileError(`Cannot scan file type: ${mimeType}`);
  }

  const response = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [contentPart, { type: "text", text: "Extract the purchased line items from this receipt." }]
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "receipt_items", schema: ITEMS_SCHEMA, strict: true }
    }
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return [];

  const parsed = JSON.parse(raw) as { items: ScannedItem[] };
  return parsed.items
    .filter((item) => item.description && item.description.trim().length > 0)
    .map((item) => ({
      ...item,
      // Belt-and-suspenders for the fuel-specific instruction above: only round when the
      // description looks like a fuel line, so non-fuel amounts keep their exact extracted value.
      amount:
        item.amount !== null && FUEL_ITEM_PATTERN.test(item.description)
          ? Math.round(item.amount * 100) / 100
          : item.amount
    }));
}
