import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getSession, Equipment, InventoryItem, ItemUsage, Location, Ticket } from "../api/client";
import { ISSUE_TYPES, issueTypeLabel } from "../issueTypes";

const STATUS_OPTIONS: Ticket["status"][] = ["new", "acknowledged", "in_progress", "done", "rejected", "duplicate"];

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isAdmin = getSession()?.is_admin ?? false;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [updating, setUpdating] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [usageRows, setUsageRows] = useState<ItemUsage[]>([]);
  const [loggingUsage, setLoggingUsage] = useState(false);
  const [statusNotes, setStatusNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [editing, setEditing] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [editLocationId, setEditLocationId] = useState("");
  const [editEquipmentId, setEditEquipmentId] = useState("");
  const [editIssueType, setEditIssueType] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<Ticket["priority"]>("normal");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    if (id) api.getTicket(Number(id)).then((t) => {
      setTicket(t);
      setStatusNotes(t.status_notes || "");
    });
  }, [id]);

  useEffect(() => {
    if (isAdmin) api.getInventoryItems().then(setItems).catch(() => setItems([]));
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) api.getLocations().then(setLocations).catch(() => setLocations([]));
  }, [isAdmin]);

  useEffect(() => {
    if (!editLocationId) {
      setEquipment([]);
      return;
    }
    api.getLocationEquipment(Number(editLocationId)).then(setEquipment).catch(() => setEquipment([]));
  }, [editLocationId]);

  function startEditing() {
    if (!ticket) return;
    setEditLocationId(String(ticket.location_id));
    setEditEquipmentId(ticket.equipment_id ? String(ticket.equipment_id) : "");
    setEditIssueType(ticket.issue_type);
    setEditDescription(ticket.description);
    setEditPriority(ticket.priority);
    setEditError("");
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!ticket) return;
    if (editIssueType === "other" && !editDescription.trim()) {
      setEditError("Please add a note describing the issue.");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      const updated = await api.updateTicket(ticket.id, {
        location_id: Number(editLocationId),
        equipment_id: editEquipmentId ? Number(editEquipmentId) : null,
        issue_type: editIssueType,
        description: editDescription.trim(),
        priority: editPriority
      });
      setTicket({ ...ticket, ...updated });
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!ticket) return;
    if (!window.confirm(`Delete ticket #${ticket.id}? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await api.deleteTicket(ticket.id);
      navigate("/dashboard");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Couldn't delete ticket.");
      setDeleting(false);
    }
  }

  async function handleStatusChange(status: Ticket["status"]) {
    if (!ticket) return;
    setUpdating(true);
    try {
      // Send along whatever's currently typed in the notes box so picking "rejected" right
      // after typing a reason captures both in one save, instead of needing two.
      const updated = await api.updateTicketStatus(ticket.id, status, undefined, statusNotes);
      setTicket({ ...ticket, ...updated });
    } finally {
      setUpdating(false);
    }
  }

  async function handleSaveNotes() {
    if (!ticket) return;
    setSavingNotes(true);
    try {
      const updated = await api.updateTicketStatus(ticket.id, ticket.status, undefined, statusNotes);
      setTicket({ ...ticket, ...updated });
    } finally {
      setSavingNotes(false);
    }
  }

  function addUsageRow() {
    setUsageRows((prev) => [...prev, { item_id: items[0]?.id || 0, quantity: 1 }]);
  }

  function updateUsageRow(index: number, patch: Partial<ItemUsage>) {
    setUsageRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeUsageRow(index: number) {
    setUsageRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleLogUsage() {
    if (!ticket || usageRows.length === 0) return;
    setLoggingUsage(true);
    try {
      await api.updateTicketStatus(ticket.id, ticket.status, usageRows);
      setUsageRows([]);
    } finally {
      setLoggingUsage(false);
    }
  }

  if (!ticket) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="header">
        <h1>Ticket #{ticket.id}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isAdmin && (
            <Link to="/inventory" className="btn" style={{ background: "#e2e4e9" }}>
              Inventory
            </Link>
          )}
          <Link to="/dashboard" className="btn" style={{ background: "#e2e4e9" }}>
            Back
          </Link>
        </div>
      </div>

      {editing ? (
        <div className="card">
          <div className="field">
            <label htmlFor="editLocation">Location</label>
            <select
              id="editLocation"
              value={editLocationId}
              onChange={(e) => {
                setEditLocationId(e.target.value);
                setEditEquipmentId("");
              }}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="editIssueType">Issue type</label>
            <select id="editIssueType" value={editIssueType} onChange={(e) => setEditIssueType(e.target.value)}>
              {ISSUE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {equipment.length > 0 && (
            <div className="field">
              <label htmlFor="editEquipment">Equipment</label>
              <select id="editEquipment" value={editEquipmentId} onChange={(e) => setEditEquipmentId(e.target.value)}>
                <option value="">Not sure / general issue</option>
                {equipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label htmlFor="editDescription">Notes{editIssueType === "other" ? "" : " (optional)"}</label>
            <textarea id="editDescription" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="editPriority">Priority</label>
            <select id="editPriority" value={editPriority} onChange={(e) => setEditPriority(e.target.value as Ticket["priority"])}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          {editError && <p className="error-text">{editError}</p>}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className="btn" style={{ background: "#e2e4e9" }} onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <p>
            <strong>{ticket.location_name}</strong>
            {ticket.equipment_name ? ` · ${ticket.equipment_name}` : ""}
          </p>
          <p className="muted" style={{ margin: "4px 0" }}>{issueTypeLabel(ticket.issue_type)}</p>
          {ticket.description && <p>{ticket.description}</p>}
          <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
            <span className={`pill pill-priority-${ticket.priority}`}>{ticket.priority}</span>
            <span className="muted">Reported via {ticket.source} on {new Date(ticket.created_at).toLocaleString()}</span>
          </div>
          {ticket.reporter_name && (
            <p className="muted" style={{ margin: "0 0 8px" }}>Reported by {ticket.reporter_name}</p>
          )}
          {ticket.reporter_email && (
            <p className="muted" style={{ margin: "0 0 8px" }}>
              Emailing updates to {ticket.reporter_email}
            </p>
          )}

          {ticket.photos && ticket.photos.length > 0 && (
            <div className="photo-thumbs">
              {ticket.photos.map((photo) => (
                <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                  <img src={photo.url} alt="Reported issue" style={{ width: 120, height: 120 }} />
                </a>
              ))}
            </div>
          )}

          {isAdmin && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="button" className="btn" style={{ background: "#e2e4e9" }} onClick={startEditing}>
                Edit ticket
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete ticket"}
              </button>
            </div>
          )}
          {editError && !editing && <p className="error-text">{editError}</p>}
        </div>
      )}

      <div className="card">
        <label htmlFor="status" style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
          Status
        </label>
        <select
          id="status"
          value={ticket.status}
          disabled={updating}
          onChange={(e) => handleStatusChange(e.target.value as Ticket["status"])}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>

        <label htmlFor="statusNotes" style={{ fontWeight: 600, display: "block", margin: "16px 0 8px" }}>
          Notes {ticket.status === "rejected" ? "(why was this rejected?)" : "(optional)"}
        </label>
        <textarea
          id="statusNotes"
          value={statusNotes}
          onChange={(e) => setStatusNotes(e.target.value)}
          placeholder="e.g. Duplicate of ticket #42, or: not a maintenance issue"
        />
        <button
          type="button"
          className="btn"
          style={{ background: "#e2e4e9", marginTop: 8 }}
          onClick={handleSaveNotes}
          disabled={savingNotes || statusNotes === (ticket.status_notes || "")}
        >
          {savingNotes ? "Saving…" : "Save notes"}
        </button>
      </div>

      {isAdmin && (
        <div className="card">
          <label style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>Parts used</label>
          {usageRows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <select
                value={row.item_id}
                onChange={(e) => updateUsageRow(i, { item_id: Number(e.target.value) })}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={row.quantity}
                style={{ width: 70 }}
                onChange={(e) => updateUsageRow(i, { quantity: Number(e.target.value) })}
              />
              <button type="button" className="btn" style={{ background: "#e2e4e9" }} onClick={() => removeUsageRow(i)}>
                Remove
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" style={{ background: "#e2e4e9" }} onClick={addUsageRow} disabled={items.length === 0}>
              + Add item
            </button>
            {usageRows.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={handleLogUsage} disabled={loggingUsage}>
                {loggingUsage ? "Logging…" : "Log usage"}
              </button>
            )}
          </div>
          {items.length === 0 && <p className="muted" style={{ marginTop: 8 }}>No inventory items in the catalog yet.</p>}
        </div>
      )}
    </div>
  );
}
