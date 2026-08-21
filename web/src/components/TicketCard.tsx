import { Link } from "react-router-dom";
import { Ticket } from "../api/client";
import { issueTypeLabel } from "../issueTypes";

export default function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <Link to={`/tickets/${ticket.id}`} className="card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>
            #{ticket.id} — {ticket.location_name}
            {ticket.equipment_name ? ` · ${ticket.equipment_name}` : ""}
          </div>
          <p className="muted" style={{ margin: "6px 0" }}>{issueTypeLabel(ticket.issue_type)}</p>
          {ticket.description && <p style={{ margin: "0 0 6px" }}>{ticket.description}</p>}
          {ticket.reporter_name && <p className="muted" style={{ margin: "0 0 6px" }}>Reported by {ticket.reporter_name}</p>}
          {ticket.parts && ticket.parts.length > 0 && (
            <p
              className="muted"
              title={ticket.parts.map((p) => `${p.quantity}× ${p.item_name}`).join(", ")}
              style={{ margin: "0 0 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              Parts: {ticket.parts.map((p) => `${p.quantity}× ${p.item_name}`).join(", ")}
            </p>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <span className={`pill pill-${ticket.status}`}>{ticket.status.replace("_", " ")}</span>
        <span className={`pill pill-priority-${ticket.priority}`}>{ticket.priority}</span>
      </div>
    </Link>
  );
}
