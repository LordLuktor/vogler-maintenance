import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, InventoryStock, LocationDetail, Ticket } from "../api/client";
import TicketCard from "../components/TicketCard";

export default function LocationsPage() {
  const [locations, setLocations] = useState<LocationDetail[]>([]);
  const [stock, setStock] = useState<InventoryStock[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [draftNotes, setDraftNotes] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  function load() {
    api
      .getLocationsFull()
      .then((locs) => {
        setLocations(locs);
        setDraftNotes(Object.fromEntries(locs.map((loc) => [loc.id, loc.notes ?? ""])));
      })
      .catch(() => setError("Couldn't load locations."));
    api.getInventoryStock().then(setStock).catch(() => setStock([]));
    api
      .getTickets({ exclude_status: ["done", "rejected", "duplicate"] })
      .then(setTickets)
      .catch(() => setTickets([]));
  }

  useEffect(load, []);

  async function handleSave(loc: LocationDetail) {
    setError("");
    setSavingId(loc.id);
    try {
      const updated = await api.updateLocation(loc.id, { notes: draftNotes[loc.id] ?? "" });
      setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save notes.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="page">
      <div className="header">
        <h1>Locations</h1>
        <Link to="/dashboard" className="btn" style={{ background: "#e2e4e9" }}>
          Back
        </Link>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        Notes about a location — HVAC filter sizes, equipment quirks, anything worth remembering next visit.
      </p>

      {error && <p className="error-text">{error}</p>}

      {locations.map((loc) => {
        const dirty = (draftNotes[loc.id] ?? "") !== (loc.notes ?? "");
        const locStock = stock.filter((s) => s.location_id === loc.id);
        const locTickets = tickets.filter((t) => t.location_id === loc.id);
        return (
          <div key={loc.id} className="card">
            <div style={{ fontWeight: 600 }}>{loc.name}</div>
            <p className="muted" style={{ margin: "4px 0" }}>
              {loc.type}
              {loc.address ? ` — ${loc.address}` : ""}
            </p>
            <div className="field">
              <label htmlFor={`notes-${loc.id}`}>Notes</label>
              <textarea
                id={`notes-${loc.id}`}
                value={draftNotes[loc.id] ?? ""}
                onChange={(e) => setDraftNotes((prev) => ({ ...prev, [loc.id]: e.target.value }))}
                placeholder="e.g. HVAC filter size 20x25x1, changed quarterly"
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={() => handleSave(loc)}
              disabled={!dirty || savingId === loc.id}
            >
              {savingId === loc.id ? "Saving…" : "Save notes"}
            </button>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Inventory</div>
              {locStock.length === 0 && <p className="muted" style={{ margin: 0 }}>No inventory tracked here.</p>}
              {locStock.map((s) => {
                const low = s.reorder_threshold > 0 && s.quantity_on_hand < s.reorder_threshold;
                return (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span>{s.item_name}</span>
                    <span style={low ? { color: "#b91c1c", fontWeight: 600 } : undefined}>
                      {s.quantity_on_hand} {s.item_unit}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Open work orders</div>
              {locTickets.length === 0 && <p className="muted" style={{ margin: 0 }}>No open work orders.</p>}
              {locTickets.map((t) => (
                <TicketCard key={t.id} ticket={t} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
