import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getSession, Receipt } from "../api/client";
import ReceiptFileCapture from "../components/ReceiptFileCapture";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReceiptsPage() {
  const session = getSession();
  const canViewReceipts = (session?.is_admin || session?.can_view_receipts) ?? false;

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(todayIsoDate());
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(canViewReceipts);
  const [openingFileId, setOpeningFileId] = useState<number | null>(null);

  useEffect(() => {
    if (!canViewReceipts) return;
    api
      .getReceipts()
      .then(setReceipts)
      .finally(() => setLoadingReceipts(false));
  }, [canViewReceipts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!description.trim() || files.length === 0) {
      setError("Description and at least one receipt file are required.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("description", description.trim());
      if (amount.trim()) formData.set("amount", amount.trim());
      formData.set("purchased_at", purchasedAt);
      files.forEach((f) => formData.append("files", f));

      await api.createReceipt(formData);
      setDescription("");
      setAmount("");
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

  return (
    <div className="page">
      <div className="header">
        <h1>Receipts</h1>
        <Link to="/dashboard" className="btn" style={{ background: "#e2e4e9" }}>
          Back
        </Link>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <h2 style={{ marginTop: 0 }}>Upload a receipt</h2>
        <div className="field">
          <label htmlFor="description">What was purchased</label>
          <input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Oil filters, Parts Store 2"
          />
        </div>
        <div className="field">
          <label htmlFor="amount">Amount (optional — leave blank if the receipt doesn't show one)</label>
          <input
            id="amount"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
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
            <div key={r.id} style={{ borderTop: "1px solid #e2e4e9", padding: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong>{r.description}</strong>
                  <p className="muted" style={{ margin: "4px 0" }}>
                    {new Date(r.purchased_at).toLocaleDateString()} · {r.uploaded_by_name || r.uploaded_by_email || "Unknown"}
                  </p>
                </div>
                <strong>{r.amount !== null ? `$${Number(r.amount).toFixed(2)}` : <span className="muted">No amount listed</span>}</strong>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {r.files.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="btn"
                    style={{ background: "#e2e4e9" }}
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
