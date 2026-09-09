import { useEffect, useState } from "react";
import { api, getSession, Receipt } from "../api/client";
import ReceiptFileCapture from "../components/ReceiptFileCapture";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface DraftItem {
  description: string;
  amount: string;
}

function emptyItem(): DraftItem {
  return { description: "", amount: "" };
}

export default function ReceiptsPage() {
  const session = getSession();
  const canViewReceipts = (session?.is_admin || session?.can_view_receipts) ?? false;

  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [purchasedAt, setPurchasedAt] = useState(todayIsoDate());
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(canViewReceipts);
  const [openingFileId, setOpeningFileId] = useState<number | null>(null);
  const [togglingItemId, setTogglingItemId] = useState<number | null>(null);

  useEffect(() => {
    if (!canViewReceipts) return;
    api
      .getReceipts()
      .then(setReceipts)
      .finally(() => setLoadingReceipts(false));
  }, [canViewReceipts]);

  function updateItem(index: number, field: keyof DraftItem, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanedItems = items
      .map((item) => ({ description: item.description.trim(), amount: item.amount.trim() }))
      .filter((item) => item.description.length > 0);

    if (cleanedItems.length === 0 || files.length === 0) {
      setError("At least one item and one receipt file are required.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set(
        "items",
        JSON.stringify(cleanedItems.map((item) => ({ description: item.description, amount: item.amount || undefined })))
      );
      formData.set("purchased_at", purchasedAt);
      files.forEach((f) => formData.append("files", f));

      await api.createReceipt(formData);
      setItems([emptyItem()]);
      setPurchasedAt(todayIsoDate());
      setFiles([]);
      setSubmitted(true);
      if (canViewReceipts) api.getReceipts().then(setReceipts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that receipt.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleViewFile(receiptId: number, fileId: number) {
    setOpeningFileId(fileId);
    try {
      const blob = await api.getReceiptFileBlob(receiptId, fileId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      setError("Couldn't open that file.");
    } finally {
      setOpeningFileId(null);
    }
  }

  async function handleToggleReturned(receiptId: number, itemId: number, isReturned: boolean) {
    setTogglingItemId(itemId);
    try {
      await api.setReceiptItemReturned(receiptId, itemId, isReturned);
      setReceipts((prev) =>
        prev.map((r) =>
          r.id !== receiptId
            ? r
            : {
                ...r,
                items: r.items.map((item) =>
                  item.id !== itemId ? item : { ...item, is_returned: isReturned }
                )
              }
        )
      );
      // Server sets returned_at/returned_by too, and re-fetching is the simplest way to
      // pick those up without duplicating that logic on the client.
      api.getReceipts().then(setReceipts);
    } catch {
      setError("Couldn't update that item.");
    } finally {
      setTogglingItemId(null);
    }
  }

  return (
    <div className="page">
      <div className="header">
        <h1>Receipts</h1>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <h2 style={{ marginTop: 0 }}>Upload a receipt</h2>

        {items.map((item, index) => (
          <div key={index} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
            <div className="field" style={{ flex: 2, marginBottom: 0 }}>
              <label htmlFor={`item-description-${index}`}>What was purchased</label>
              <input
                id={`item-description-${index}`}
                value={item.description}
                onChange={(e) => updateItem(index, "description", e.target.value)}
                placeholder="e.g. Oil filters, Parts Store 2"
              />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor={`item-amount-${index}`}>Amount (optional)</label>
              <input
                id={`item-amount-${index}`}
                type="number"
                step="0.01"
                min="0.01"
                value={item.amount}
                onChange={(e) => updateItem(index, "amount", e.target.value)}
                placeholder="0.00"
              />
            </div>
            {items.length > 1 && (
              <button type="button" className="btn btn-secondary" onClick={() => removeItem(index)}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginBottom: 16 }}
          onClick={() => setItems((prev) => [...prev, emptyItem()])}
        >
          + Add another item
        </button>

        <div className="field">
          <label htmlFor="purchasedAt">Purchase date</label>
          <input id="purchasedAt" type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
        </div>
        <ReceiptFileCapture onChange={setFiles} />
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Uploading…" : "Upload receipt"}
        </button>
        {submitted && <p className="muted" style={{ marginTop: 8 }}>Receipt uploaded.</p>}
      </form>

      {canViewReceipts && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>All receipts</h2>
          {loadingReceipts && <p className="muted">Loading…</p>}
          {!loadingReceipts && receipts.length === 0 && <p className="muted">No receipts uploaded yet.</p>}
          {receipts.map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <p className="muted" style={{ margin: "0 0 6px" }}>
                {new Date(r.purchased_at).toLocaleDateString()} · {r.uploaded_by_name || r.uploaded_by_email || "Unknown"}
              </p>

              {r.items.map((item) => (
                <div
                  key={item.id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}
                >
                  <div>
                    <span style={item.is_returned ? { textDecoration: "line-through" } : undefined}>
                      {item.description}
                    </span>{" "}
                    <strong>{item.amount !== null ? `$${Number(item.amount).toFixed(2)}` : ""}</strong>
                    {item.is_returned && (
                      <span className="muted" style={{ marginLeft: 8 }}>
                        Returned{item.returned_by_name ? ` by ${item.returned_by_name}` : ""}
                        {item.returned_at ? ` on ${new Date(item.returned_at).toLocaleDateString()}` : ""}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={togglingItemId === item.id}
                    onClick={() => handleToggleReturned(r.id, item.id, !item.is_returned)}
                  >
                    {togglingItemId === item.id ? "Saving…" : item.is_returned ? "Undo return" : "Mark returned"}
                  </button>
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {r.files.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleViewFile(r.id, f.id)}
                    disabled={openingFileId === f.id}
                  >
                    {openingFileId === f.id ? "Opening…" : f.original_filename || `File ${f.id}`}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
