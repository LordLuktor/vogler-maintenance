import { useEffect, useState } from "react";
import { api, Asset, Location } from "../api/client";

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState("");

  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newHomeLocationId, setNewHomeLocationId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const [moveTarget, setMoveTarget] = useState<Record<number, string>>({});

  function loadAssets() {
    api.getAssets().then(setAssets).catch(() => setAssets([]));
  }

  useEffect(() => {
    loadAssets();
    api.getLocations(true).then(setLocations).catch(() => setLocations([]));
  }, []);

  function resetForm() {
    setEditingAssetId(null);
    setNewName("");
    setNewHomeLocationId("");
    setNewNotes("");
    setError("");
  }

  function startEdit(asset: Asset) {
    setEditingAssetId(asset.id);
    setNewName(asset.name);
    setNewHomeLocationId(String(asset.home_location_id));
    setNewNotes(asset.notes || "");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!newName.trim() || !newHomeLocationId) {
      setError("Name and a storage (home) location are required.");
      return;
    }
    setCreating(true);
    try {
      if (editingAssetId) {
        await api.updateAsset(editingAssetId, {
          name: newName.trim(),
          home_location_id: Number(newHomeLocationId),
          notes: newNotes.trim()
        });
      } else {
        await api.createAsset({
          name: newName.trim(),
          home_location_id: Number(newHomeLocationId),
          notes: newNotes.trim() || undefined
        });
      }
      resetForm();
      loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that asset.");
    } finally {
      setCreating(false);
    }
  }

  async function handleMove(asset: Asset) {
    const target = moveTarget[asset.id];
    if (!target) return;
    await api.updateAsset(asset.id, { current_location_id: Number(target) });
    setMoveTarget((prev) => ({ ...prev, [asset.id]: "" }));
    loadAssets();
  }

  async function handleDelete(asset: Asset) {
    await api.deleteAsset(asset.id);
    if (editingAssetId === asset.id) resetForm();
    loadAssets();
  }

  return (
    <div className="page">
      <div className="header">
        <h1>Assets</h1>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <h2 style={{ marginTop: 0 }}>{editingAssetId ? "Edit asset" : "Add an asset"}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          For shared equipment usable at any location but stored at one — like a tractor.
        </p>
        <div className="field">
          <label htmlFor="assetName">Name</label>
          <input id="assetName" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Tractor" />
        </div>
        <div className="field">
          <label htmlFor="assetHome">Storage (home) location</label>
          <select id="assetHome" value={newHomeLocationId} onChange={(e) => setNewHomeLocationId(e.target.value)}>
            <option value="">Select a location…</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="assetNotes">Notes (optional)</label>
          <input id="assetNotes" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Saving…" : editingAssetId ? "Save changes" : "Add asset"}
          </button>
          {editingAssetId && (
            <button type="button" className="btn btn-secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {assets.length === 0 && <p className="muted">No assets yet.</p>}

      {assets.map((asset) => (
        <div key={asset.id} className="card">
          <div style={{ fontWeight: 600 }}>{asset.name}</div>
          <p className="muted" style={{ margin: "4px 0" }}>
            Stored at {asset.home_location_name}
            {asset.current_location_id !== asset.home_location_id
              ? ` — currently at ${asset.current_location_name}`
              : " — currently at home"}
          </p>
          {asset.notes && <p className="muted" style={{ margin: "4px 0" }}>{asset.notes}</p>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={moveTarget[asset.id] || ""}
              onChange={(e) => setMoveTarget((prev) => ({ ...prev, [asset.id]: e.target.value }))}
            >
              <option value="">Move to…</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary" onClick={() => handleMove(asset)}>
              Move
            </button>
            <button className="btn btn-secondary" onClick={() => startEdit(asset)}>
              Edit
            </button>
            <button className="btn" style={{ background: "#fee2e2" }} onClick={() => handleDelete(asset)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
