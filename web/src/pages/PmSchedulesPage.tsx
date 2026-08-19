import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getSession, InventoryItem, ItemUsage, Location, Equipment, PmSchedule } from "../api/client";
import { ISSUE_TYPES, issueTypeLabel } from "../issueTypes";

export default function PmSchedulesPage() {
  const isAdmin = getSession()?.is_admin ?? false;
  const [schedules, setSchedules] = useState<PmSchedule[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [usageByScheduleId, setUsageByScheduleId] = useState<Record<number, ItemUsage[]>>({});
  const [error, setError] = useState("");

  const [locationId, setLocationId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [title, setTitle] = useState("");
  const [issueType, setIssueType] = useState("");
  const [priority, setPriority] = useState("normal");
  const [intervalDays, setIntervalDays] = useState("90");
  const [nextDueAt, setNextDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function loadSchedules() {
    api.getPmSchedules().then(setSchedules).catch(() => setSchedules([]));
  }

  useEffect(() => {
    loadSchedules();
    api.getLocations(true).then(setLocations).catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    if (isAdmin) api.getInventoryItems().then(setInventoryItems).catch(() => setInventoryItems([]));
  }, [isAdmin]);

  useEffect(() => {
    if (!locationId) {
      setEquipment([]);
      return;
    }
    api.getLocationEquipment(Number(locationId)).then(setEquipment).catch(() => setEquipment([]));
  }, [locationId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!locationId || !title.trim() || !issueType || !nextDueAt) {
      setError("Please fill in location, title, issue type, and first due date.");
      return;
    }

    setSubmitting(true);
    try {
      await api.createPmSchedule({
        location_id: Number(locationId),
        equipment_id: equipmentId ? Number(equipmentId) : undefined,
        title: title.trim(),
        issue_type: issueType,
        priority,
        interval_days: Number(intervalDays),
        next_due_at: new Date(nextDueAt).toISOString()
      });
      setTitle("");
      setIssueType("");
      setNextDueAt("");
      loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the schedule.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(id: number) {
    await api.completePmSchedule(id, usageByScheduleId[id]);
    setUsageByScheduleId((prev) => ({ ...prev, [id]: [] }));
    loadSchedules();
  }

  function getUsageRows(scheduleId: number): ItemUsage[] {
    return usageByScheduleId[scheduleId] || [];
  }

  function addUsageRow(scheduleId: number) {
    setUsageByScheduleId((prev) => ({
      ...prev,
      [scheduleId]: [...getUsageRows(scheduleId), { item_id: inventoryItems[0]?.id || 0, quantity: 1 }]
    }));
  }

  function updateUsageRow(scheduleId: number, index: number, patch: Partial<ItemUsage>) {
    setUsageByScheduleId((prev) => ({
      ...prev,
      [scheduleId]: getUsageRows(scheduleId).map((row, i) => (i === index ? { ...row, ...patch } : row))
    }));
  }

  function removeUsageRow(scheduleId: number, index: number) {
    setUsageByScheduleId((prev) => ({
      ...prev,
      [scheduleId]: getUsageRows(scheduleId).filter((_, i) => i !== index)
    }));
  }

  async function handleToggleActive(schedule: PmSchedule) {
    await api.setPmScheduleActive(schedule.id, !schedule.active);
    loadSchedules();
  }

  return (
    <div className="page">
      <div className="header">
        <h1>Preventive Maintenance</h1>
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

      <form className="card" onSubmit={handleCreate}>
        <h2 style={{ marginTop: 0 }}>New schedule</h2>
        <div className="field">
          <label htmlFor="pmLocation">Location</label>
          <select
            id="pmLocation"
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setEquipmentId("");
            }}
          >
            <option value="">Select a location…</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>

        {equipment.length > 0 && (
          <div className="field">
            <label htmlFor="pmEquipment">Equipment (optional)</label>
            <select id="pmEquipment" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
              <option value="">Location-wide</option>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="pmTitle">Task</label>
          <input
            id="pmTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Replace HVAC filter"
          />
        </div>

        <div className="field">
          <label htmlFor="pmIssueType">Issue type</label>
          <select id="pmIssueType" value={issueType} onChange={(e) => setIssueType(e.target.value)}>
            <option value="">Select an issue type…</option>
            {ISSUE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="pmPriority">Priority (of the ticket it creates)</label>
          <select id="pmPriority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="pmInterval">Repeat every (days)</label>
          <input
            id="pmInterval"
            type="number"
            min={1}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="pmNextDue">First due date</label>
          <input id="pmNextDue" type="date" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} />
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Add schedule"}
        </button>
      </form>

      {schedules.map((s) => (
        <div key={s.id} className="card" style={{ opacity: s.active ? 1 : 0.5 }}>
          <div style={{ fontWeight: 600 }}>
            {s.title} — {s.location_name}
            {s.equipment_name ? ` · ${s.equipment_name}` : ""}
          </div>
          <p className="muted" style={{ margin: "6px 0" }}>
            {issueTypeLabel(s.issue_type)} · every {s.interval_days} days
          </p>
          <p className="muted" style={{ margin: "0 0 8px" }}>
            Next due: {new Date(s.next_due_at).toLocaleDateString()}
            {s.current_ticket_id ? " — ticket already open" : ""}
            {s.last_completed_at ? ` · last done ${new Date(s.last_completed_at).toLocaleDateString()}` : ""}
          </p>
          {isAdmin && (
            <div style={{ margin: "8px 0" }}>
              <label className="muted" style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>
                Parts used
              </label>
              {getUsageRows(s.id).map((row, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <select value={row.item_id} onChange={(e) => updateUsageRow(s.id, i, { item_id: Number(e.target.value) })}>
                    {inventoryItems.map((item) => (
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
                    onChange={(e) => updateUsageRow(s.id, i, { quantity: Number(e.target.value) })}
                  />
                  <button type="button" className="btn" style={{ background: "#e2e4e9" }} onClick={() => removeUsageRow(s.id, i)}>
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn"
                style={{ background: "#e2e4e9" }}
                onClick={() => addUsageRow(s.id)}
                disabled={inventoryItems.length === 0}
              >
                + Add item
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => handleComplete(s.id)}>
              Mark complete
            </button>
            <button className="btn" style={{ background: "#e2e4e9" }} onClick={() => handleToggleActive(s)}>
              {s.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
