import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, getToken, Location, Equipment } from "../api/client";
import { ISSUE_TYPES } from "../issueTypes";
import PhotoCapture from "../components/PhotoCapture";

export default function ReportPage() {
  const [searchParams] = useSearchParams();
  const preselectedLocation = searchParams.get("location");
  const isLoggedIn = !!getToken();

  const [locations, setLocations] = useState<Location[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [locationId, setLocationId] = useState(preselectedLocation || "");
  const [equipmentId, setEquipmentId] = useState("");
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [priority, setPriority] = useState("normal");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ticketId, setTicketId] = useState<number | null>(null);

  useEffect(() => {
    api.getLocations().then(setLocations).catch(() => setError("Couldn't load locations. Try refreshing."));
  }, []);

  useEffect(() => {
    if (!locationId) {
      setEquipment([]);
      return;
    }
    api.getLocationEquipment(Number(locationId)).then(setEquipment).catch(() => setEquipment([]));
  }, [locationId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!locationId || !issueType) {
      setError("Please pick a location and an issue type.");
      return;
    }
    if (issueType === "other" && !description.trim()) {
      setError("Please add a note describing the issue.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("location_id", locationId);
      if (equipmentId) formData.set("equipment_id", equipmentId);
      formData.set("issue_type", issueType);
      formData.set("description", description.trim());
      if (reporterName.trim()) formData.set("reporter_name", reporterName.trim());
      if (reporterPhone.trim()) formData.set("reporter_phone", reporterPhone.trim());
      if (reporterEmail.trim()) formData.set("reporter_email", reporterEmail.trim());
      formData.set("priority", priority);
      photos.forEach((photo) => formData.append("photos", photo));

      const result = await api.submitTicket(formData);
      setTicketId(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong submitting your report.");
    } finally {
      setSubmitting(false);
    }
  }

  if (ticketId !== null) {
    return (
      <div className="page">
        <div className="card">
          <h1>Report submitted</h1>
          <p>Ticket #{ticketId} has been sent to maintenance. Thanks for flagging it!</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Report another issue
            </button>
            {isLoggedIn && (
              <Link to="/dashboard" className="btn" style={{ background: "#e2e4e9" }}>
                Back to Dashboard
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="header">
        <h1>Report a Maintenance Issue</h1>
        {isLoggedIn && (
          <Link to="/dashboard" className="btn" style={{ background: "#e2e4e9" }}>
            Back to Dashboard
          </Link>
        )}
      </div>
      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="location">Location</label>
          <select
            id="location"
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setEquipmentId("");
            }}
            required
          >
            <option value="" disabled>
              Select a location…
            </option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="issueType">What kind of issue is it?</label>
          <select id="issueType" value={issueType} onChange={(e) => setIssueType(e.target.value)} required>
            <option value="" disabled>
              Select an issue type…
            </option>
            {ISSUE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {equipment.length > 0 && (
          <div className="field">
            <label htmlFor="equipment">Equipment (optional)</label>
            <select id="equipment" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
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
          <label htmlFor="description">Notes{issueType === "other" ? "" : " (optional)"}</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Bay 3 lift won't rise all the way, makes a grinding noise"
            required={issueType === "other"}
          />
        </div>

        <div className="field">
          <label htmlFor="priority">How urgent is it?</label>
          <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low — whenever you get a chance</option>
            <option value="normal">Normal</option>
            <option value="high">High — affecting work today</option>
            <option value="urgent">Urgent — safety issue / shop down</option>
          </select>
        </div>

        <PhotoCapture onChange={setPhotos} />

        <div className="field">
          <label htmlFor="reporterName">Your name (optional)</label>
          <input id="reporterName" value={reporterName} onChange={(e) => setReporterName(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="reporterPhone">Your phone number (optional, in case Scott has questions)</label>
          <input
            id="reporterPhone"
            type="tel"
            value={reporterPhone}
            onChange={(e) => setReporterPhone(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="reporterEmail">Your email (optional, to get updates on this ticket)</label>
          <input
            id="reporterEmail"
            type="email"
            value={reporterEmail}
            onChange={(e) => setReporterEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Report"}
        </button>
      </form>
    </div>
  );
}
