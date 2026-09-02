import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Location, Ticket } from "../api/client";
import TicketCard from "../components/TicketCard";
import MultiSelectDropdown from "../components/MultiSelectDropdown";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "rejected", label: "Rejected" },
  { value: "duplicate", label: "Duplicate" }
];

export default function DashboardPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [status, setStatus] = useState("");
  const [excludeStatuses, setExcludeStatuses] = useState<string[]>(["done", "rejected", "duplicate"]);
  const [locationId, setLocationId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLocations(true).then(setLocations).catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .getTickets({
        status: status || undefined,
        exclude_status: !status && excludeStatuses.length > 0 ? excludeStatuses : undefined,
        location_id: locationId ? Number(locationId) : undefined
      })
      .then(setTickets)
      .finally(() => setLoading(false));
  }, [status, excludeStatuses, locationId]);

  return (
    <div className="page">
      <div className="header">
        <h1>Tickets</h1>
        <Link to="/report" className="btn btn-primary">
          New Ticket
        </Link>
      </div>

      <div className="filter-bar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
          <option value="rejected">Rejected</option>
          <option value="duplicate">Duplicate</option>
        </select>
        <MultiSelectDropdown
          options={STATUS_OPTIONS}
          selected={excludeStatuses}
          onChange={setExcludeStatuses}
          placeholder="Exclude: none"
          selectedPrefix="Exclude"
          disabled={!!status}
        />
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">All locations</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {!loading && tickets.length === 0 && <p className="muted">No tickets match these filters.</p>}
      {tickets.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} />
      ))}
    </div>
  );
}
