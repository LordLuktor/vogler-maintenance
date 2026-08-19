import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Location, User } from "../api/client";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [allLocations, setAllLocations] = useState(false);
  const [canViewReceipts, setCanViewReceipts] = useState(false);
  const [locationIds, setLocationIds] = useState<number[]>([]);

  function loadUsers() {
    api.getUsers().then(setUsers).catch(() => setUsers([]));
  }

  useEffect(() => {
    loadUsers();
    api.getLocations(true).then(setLocations).catch(() => setLocations([]));
  }, []);

  function resetForm() {
    setEditingUserId(null);
    setEmail("");
    setName("");
    setPassword("");
    setIsAdmin(false);
    setAllLocations(false);
    setCanViewReceipts(false);
    setLocationIds([]);
  }

  function generatePassword() {
    // 18 raw bytes gives 24 base64 chars before stripping symbols, comfortably clearing
    // the 16-char slice even after +/=  are stripped out.
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    setPassword(btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 16));
  }

  function startEdit(user: User) {
    setEditingUserId(user.id);
    setEmail(user.email);
    setName(user.name || "");
    setIsAdmin(user.is_admin);
    setAllLocations(user.all_locations);
    setCanViewReceipts(user.can_view_receipts);
    setLocationIds(user.locations.map((l) => l.id));
    setError("");
  }

  function toggleLocation(id: number) {
    setLocationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!editingUserId && !email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!editingUserId && password && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingUserId) {
        await api.updateUser(editingUserId, {
          name: name.trim() || undefined,
          is_admin: isAdmin,
          all_locations: allLocations,
          can_view_receipts: canViewReceipts,
          location_ids: locationIds
        });
      } else {
        await api.createUser({
          email: email.trim(),
          name: name.trim() || undefined,
          password: password || undefined,
          is_admin: isAdmin,
          all_locations: allLocations,
          can_view_receipts: canViewReceipts,
          location_ids: locationIds
        });
      }
      resetForm();
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    await api.deleteUser(id);
    if (editingUserId === id) resetForm();
    loadUsers();
  }

  return (
    <div className="page">
      <div className="header">
        <h1>Users</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/inventory" className="btn" style={{ background: "#e2e4e9" }}>
            Inventory
          </Link>
          <Link to="/dashboard" className="btn" style={{ background: "#e2e4e9" }}>
            Back
          </Link>
        </div>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <h2 style={{ marginTop: 0 }}>{editingUserId ? "Edit user" : "Add a user"}</h2>

        <div className="field">
          <label htmlFor="userEmail">Email</label>
          <input
            id="userEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!editingUserId}
          />
          {editingUserId && <p className="muted">Email can't be changed — remove and re-add if it's wrong.</p>}
        </div>

        <div className="field">
          <label htmlFor="userName">Name (optional)</label>
          <input id="userName" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {!editingUserId && (
          <div className="field">
            <label htmlFor="userPassword">Password (optional)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="userPassword"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to email an invite link instead"
              />
              <button type="button" className="btn" style={{ background: "#e2e4e9" }} onClick={generatePassword}>
                Generate
              </button>
            </div>
            <p className="muted">
              Set a password here and share it with them directly, or leave this blank to send an email invite link
              instead. Either way, they can change their password afterward from the "Forgot password" link on the
              login page.
            </p>
          </div>
        )}

        <div className="field">
          <label>
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> Can manage
            users
          </label>
        </div>

        <div className="field">
          <label>
            <input type="checkbox" checked={allLocations} onChange={(e) => setAllLocations(e.target.checked)} /> Sees
            all locations
          </label>
        </div>

        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={canViewReceipts}
              onChange={(e) => setCanViewReceipts(e.target.checked)}
            />{" "}
            Can view receipts
          </label>
        </div>

        {!allLocations && (
          <div className="field">
            <label>Locations this user can see</label>
            {locations.map((loc) => (
              <label key={loc.id} style={{ display: "block", fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={locationIds.includes(loc.id)}
                  onChange={() => toggleLocation(loc.id)}
                />{" "}
                {loc.name}
              </label>
            ))}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Saving…" : editingUserId ? "Save changes" : password ? "Create user" : "Send invite"}
          </button>
          {editingUserId && (
            <button type="button" className="btn" style={{ background: "#e2e4e9" }} onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {users.map((u) => (
        <div key={u.id} className="card">
          <div style={{ fontWeight: 600 }}>
            {u.name ? `${u.name} — ` : ""}
            {u.email}
          </div>
          <p className="muted" style={{ margin: "6px 0" }}>
            {u.is_admin ? "Admin · " : ""}
            {!u.is_admin && u.can_view_receipts ? "Can view receipts · " : ""}
            {u.all_locations ? "All locations" : u.locations.map((l) => l.name).join(", ") || "No locations assigned"}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" style={{ background: "#e2e4e9" }} onClick={() => startEdit(u)}>
              Edit
            </button>
            <button className="btn" style={{ background: "#fee2e2" }} onClick={() => handleDelete(u.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
