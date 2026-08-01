export interface UpcLookupResult {
  found: boolean;
  name?: string;
  brand?: string;
}

// UPCitemdb's keyless "trial" endpoint: no signup/API key needed, just rate-limited by
// source IP (~100 lookups/day). Fine for occasional new-item entry in a single shop; if
// that limit ever becomes a real constraint, swap in a paid provider + API key here.
const TRIAL_LOOKUP_URL = "https://api.upcitemdb.com/prod/trial/lookup";

export async function lookupUpc(barcode: string): Promise<UpcLookupResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${TRIAL_LOOKUP_URL}?upc=${encodeURIComponent(barcode)}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return { found: false };

    const data = (await res.json()) as { items?: { title?: string; brand?: string }[] };
    const item = data?.items?.[0];
    if (!item?.title) return { found: false };

    return { found: true, name: item.title, brand: item.brand || undefined };
  } catch {
    return { found: false };
  }
}
