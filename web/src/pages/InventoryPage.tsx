import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { api, InventoryItem, InventoryStock, Location } from "../api/client";

// Lazy-loaded so the barcode-scanning library only ships to admins who open Inventory,
// not to every visitor of the public /report form.
const BarcodeScanner = lazy(() => import("../components/BarcodeScanner"));

type ScanContext = "newItem" | "editItem" | "findItem";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stock, setStock] = useState<InventoryStock[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState("");

  const [itemFilter, setItemFilter] = useState("");

  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("each");
  const [newItemNotes, setNewItemNotes] = useState("");
  const [newItemPartNumber, setNewItemPartNumber] = useState("");
  const [newItemBarcode, setNewItemBarcode] = useState("");
  const [creatingItem, setCreatingItem] = useState(false);
  const [lookingUpUpc, setLookingUpUpc] = useState(false);

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", unit: "", notes: "", part_number: "", barcode: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  const [scanContext, setScanContext] = useState<ScanContext | null>(null);
  const [findBarcodeMessage, setFindBarcodeMessage] = useState("");

  const [trackItemId, setTrackItemId] = useState("");
  const [trackLocationId, setTrackLocationId] = useState("");
  const [trackQuantity, setTrackQuantity] = useState("0");
  const [trackThreshold, setTrackThreshold] = useState("0");
  const [creatingStock, setCreatingStock] = useState(false);

  const [adjustments, setAdjustments] = useState<Record<number, { delta: string; reason: "restock" | "manual_adjustment" }>>({});

  const [transferItemId, setTransferItemId] = useState("");
  const [transferFromLocationId, setTransferFromLocationId] = useState("");
  const [transferToLocationId, setTransferToLocationId] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferNotice, setTransferNotice] = useState("");

  function loadAll() {
    api.getInventoryItems().then(setItems).catch(() => setItems([]));
    api.getInventoryStock().then(setStock).catch(() => setStock([]));
  }

  useEffect(() => {
    loadAll();
    api.getLocations(true).then(setLocations).catch(() => setLocations([]));
  }, []);

  const filteredStock = useMemo(
    () => (itemFilter ? stock.filter((s) => s.item_id === Number(itemFilter)) : stock),
    [stock, itemFilter]
  );

  const totalsByItem = useMemo(() => {
    const totals = new Map<number, { item_name: string; item_unit: string; total: number }>();
    for (const s of filteredStock) {
      const existing = totals.get(s.item_id);
      if (existing) {
        existing.total += s.quantity_on_hand;
      } else {
        totals.set(s.item_id, { item_name: s.item_name, item_unit: s.item_unit, total: s.quantity_on_hand });
      }
    }
    return Array.from(totals.values()).sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [filteredStock]);

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!newItemName.trim()) {
      setError("Item name is required.");
      return;
    }
    setCreatingItem(true);
    try {
      await api.createInventoryItem({
        name: newItemName.trim(),
        unit: newItemUnit.trim() || "each",
        notes: newItemNotes.trim() || undefined,
        part_number: newItemPartNumber.trim() || undefined,
        barcode: newItemBarcode.trim() || undefined
      });
      setNewItemName("");
      setNewItemUnit("each");
      setNewItemNotes("");
      setNewItemPartNumber("");
      setNewItemBarcode("");
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that item.");
    } finally {
      setCreatingItem(false);
    }
  }

  async function handleArchiveToggle(item: InventoryItem) {
    await api.updateInventoryItem(item.id, { active: !item.active });
    loadAll();
  }

  function startEditItem(item: InventoryItem) {
    setEditingItemId(item.id);
    setEditForm({
      name: item.name,
      unit: item.unit,
      notes: item.notes || "",
      part_number: item.part_number || "",
      barcode: item.barcode || ""
    });
    setError("");
  }

  async function handleSaveEdit(itemId: number) {
    if (!editForm.name.trim()) {
      setError("Item name is required.");
      return;
    }
    setSavingEdit(true);
    setError("");
    try {
      await api.updateInventoryItem(itemId, {
        name: editForm.name.trim(),
        unit: editForm.unit.trim() || "each",
        notes: editForm.notes.trim() || null,
        part_number: editForm.part_number.trim() || null,
        barcode: editForm.barcode.trim() || null
      });
      setEditingItemId(null);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleScanDetected(code: string) {
    const context = scanContext;
    setScanContext(null);

    if (context === "newItem") {
      setNewItemBarcode(code);
      if (!newItemName.trim()) {
        setLookingUpUpc(true);
        try {
          const result = await api.lookupUpc(code);
          if (result.found && result.name) {
            setNewItemName(result.brand ? `${result.brand} ${result.name}` : result.name);
          }
        } finally {
          setLookingUpUpc(false);
        }
      }
    } else if (context === "editItem") {
      setEditForm((prev) => ({ ...prev, barcode: code }));
    } else if (context === "findItem") {
      setFindBarcodeMessage("Looking up…");
      try {
        const item = await api.lookupInventoryItemByBarcode(code);
        setTrackItemId(String(item.id));
        setFindBarcodeMessage(`Found: ${item.name}`);
      } catch {
        setFindBarcodeMessage("No catalog item matches that barcode — add it above first.");
      }
    }
  }

  async function handleTrackStock(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!trackItemId || !trackLocationId) {
      setError("Pick an item and a location to start tracking.");
      return;
    }
    setCreatingStock(true);
    try {
      await api.createInventoryStock({
        item_id: Number(trackItemId),
        location_id: Number(trackLocationId),
        quantity_on_hand: Number(trackQuantity) || 0,
        reorder_threshold: Number(trackThreshold) || 0
      });
      setTrackItemId("");
      setTrackLocationId("");
      setTrackQuantity("0");
      setTrackThreshold("0");
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start tracking that item.");
    } finally {
      setCreatingStock(false);
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    setTransferError("");
    setTransferNotice("");

    const itemId = Number(transferItemId);
    const fromLocationId = Number(transferFromLocationId);
    const toLocationId = Number(transferToLocationId);
    const quantity = Number(transferQuantity);

    if (!itemId || !fromLocationId) {
      setTransferError("Pick an item and a source location.");
      return;
    }
    if (!toLocationId) {
      setTransferError("Pick a destination location.");
      return;
    }
    if (fromLocationId === toLocationId) {
      setTransferError("Source and destination locations must be different.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setTransferError("Enter a quantity of at least 1 to transfer.");
      return;
    }

    setTransferring(true);
    try {
      await api.transferInventoryStock({
        item_id: itemId,
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        quantity,
        notes: transferNotes.trim() || undefined
      });
      setTransferQuantity("");
      setTransferNotes("");
      setTransferNotice("Stock transferred.");
      loadAll();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Couldn't transfer that stock.");
    } finally {
      setTransferring(false);
    }
  }

  async function handleThresholdChange(s: InventoryStock, value: string) {
    const threshold = Number(value);
    if (!Number.isInteger(threshold) || threshold < 0) return;
    await api.updateInventoryThreshold(s.id, threshold);
    loadAll();
  }

  function getAdjustment(stockId: number) {
    return adjustments[stockId] || { delta: "", reason: "restock" as const };
  }

  function setAdjustment(stockId: number, patch: Partial<{ delta: string; reason: "restock" | "manual_adjustment" }>) {
    setAdjustments((prev) => ({ ...prev, [stockId]: { ...getAdjustment(stockId), ...patch } }));
  }

  async function handleAdjust(s: InventoryStock) {
    const { delta, reason } = getAdjustment(s.id);
    const quantityDelta = Number(delta);
    if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
      setError("Enter a nonzero whole number to adjust by (negative to remove stock).");
      return;
    }
    setError("");
    await api.adjustInventoryStock(s.id, { quantity_delta: quantityDelta, reason });
    setAdjustments((prev) => ({ ...prev, [s.id]: { delta: "", reason } }));
    loadAll();
  }

  return (
    <div className="page">
      <div className="header">
        <h1>Inventory</h1>
      </div>

      <form className="card" onSubmit={handleCreateItem}>
        <h2 style={{ marginTop: 0 }}>Add a catalog item</h2>
        <div className="field">
          <label htmlFor="itemBarcode">Barcode / SKU (optional)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="itemBarcode"
              value={newItemBarcode}
              onChange={(e) => setNewItemBarcode(e.target.value)}
              placeholder="Scan or type"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-secondary" onClick={() => setScanContext("newItem")}>
              Scan
            </button>
          </div>
          {lookingUpUpc && <p className="muted" style={{ marginTop: 4 }}>Looking up product name…</p>}
        </div>
        <div className="field">
          <label htmlFor="itemName">Name</label>
          <input
            id="itemName"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="e.g. Halogen bulb, H11"
          />
        </div>
        <div className="field">
          <label htmlFor="itemPartNumber">Part number (optional)</label>
          <input id="itemPartNumber" value={newItemPartNumber} onChange={(e) => setNewItemPartNumber(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="itemUnit">Unit</label>
          <input id="itemUnit" value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="itemNotes">Notes (optional)</label>
          <input id="itemNotes" value={newItemNotes} onChange={(e) => setNewItemNotes(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={creatingItem}>
          {creatingItem ? "Adding…" : "Add item"}
        </button>
      </form>

      {items.map((item) =>
        editingItemId === item.id ? (
          <div key={item.id} className="card">
            <div className="field">
              <label htmlFor={`editBarcode-${item.id}`}>Barcode / SKU</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id={`editBarcode-${item.id}`}
                  value={editForm.barcode}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, barcode: e.target.value }))}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-secondary" onClick={() => setScanContext("editItem")}>
                  Scan
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor={`editName-${item.id}`}>Name</label>
              <input
                id={`editName-${item.id}`}
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor={`editPartNumber-${item.id}`}>Part number</label>
              <input
                id={`editPartNumber-${item.id}`}
                value={editForm.part_number}
                onChange={(e) => setEditForm((prev) => ({ ...prev, part_number: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor={`editUnit-${item.id}`}>Unit</label>
              <input
                id={`editUnit-${item.id}`}
                value={editForm.unit}
                onChange={(e) => setEditForm((prev) => ({ ...prev, unit: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor={`editNotes-${item.id}`}>Notes</label>
              <input
                id={`editNotes-${item.id}`}
                value={editForm.notes}
                onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={() => handleSaveEdit(item.id)} disabled={savingEdit}>
                {savingEdit ? "Saving…" : "Save"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setEditingItemId(null);
                  setError("");
                }}
                disabled={savingEdit}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div key={item.id} className="card" style={{ opacity: item.active ? 1 : 0.5 }}>
            <div style={{ fontWeight: 600 }}>
              {item.name} <span className="muted">({item.unit})</span>
            </div>
            {item.part_number && <p className="muted" style={{ margin: "4px 0" }}>Part #: {item.part_number}</p>}
            {item.barcode && <p className="muted" style={{ margin: "4px 0" }}>Barcode: {item.barcode}</p>}
            {item.notes && <p className="muted" style={{ margin: "4px 0" }}>{item.notes}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => startEditItem(item)}>
                Edit
              </button>
              <button className="btn btn-secondary" onClick={() => handleArchiveToggle(item)}>
                {item.active ? "Archive" : "Reactivate"}
              </button>
            </div>
          </div>
        )
      )}

      <form className="card" onSubmit={handleTrackStock}>
        <h2 style={{ marginTop: 0 }}>Track an item at a location</h2>
        <div className="field">
          <label htmlFor="trackItem">Item</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select id="trackItem" value={trackItemId} onChange={(e) => setTrackItemId(e.target.value)} style={{ flex: 1 }}>
              <option value="">Select an item…</option>
              {items.filter((i) => i.active).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setFindBarcodeMessage("");
                setScanContext("findItem");
              }}
            >
              Scan
            </button>
          </div>
          {findBarcodeMessage && <p className="muted" style={{ marginTop: 4 }}>{findBarcodeMessage}</p>}
        </div>
        <div className="field">
          <label htmlFor="trackLocation">Location</label>
          <select id="trackLocation" value={trackLocationId} onChange={(e) => setTrackLocationId(e.target.value)}>
            <option value="">Select a location…</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="trackQuantity">Quantity on hand right now</label>
          <input
            id="trackQuantity"
            type="number"
            min={0}
            value={trackQuantity}
            onChange={(e) => setTrackQuantity(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="trackThreshold">Reorder threshold (0 = no low-stock alert)</label>
          <input
            id="trackThreshold"
            type="number"
            min={0}
            value={trackThreshold}
            onChange={(e) => setTrackThreshold(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={creatingStock}>
          {creatingStock ? "Saving…" : "Start tracking"}
        </button>
      </form>

      <form className="card" onSubmit={handleTransfer}>
        <h2 style={{ marginTop: 0 }}>Transfer stock between locations</h2>
        <div className="field">
          <label htmlFor="transferItem">Item</label>
          <select id="transferItem" value={transferItemId} onChange={(e) => setTransferItemId(e.target.value)}>
            <option value="">Select an item…</option>
            {items.filter((i) => i.active).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="transferFrom">From location</label>
          <select id="transferFrom" value={transferFromLocationId} onChange={(e) => setTransferFromLocationId(e.target.value)}>
            <option value="">Select a location…</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="transferTo">To location</label>
          <select id="transferTo" value={transferToLocationId} onChange={(e) => setTransferToLocationId(e.target.value)}>
            <option value="">Select a location…</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="transferQuantity">Quantity</label>
          <input
            id="transferQuantity"
            type="number"
            min={1}
            value={transferQuantity}
            onChange={(e) => setTransferQuantity(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="transferNotes">Notes (optional)</label>
          <input id="transferNotes" value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} />
        </div>
        {transferError && <p className="error-text">{transferError}</p>}
        {transferNotice && <p className="muted">{transferNotice}</p>}
        <button className="btn btn-primary" type="submit" disabled={transferring}>
          {transferring ? "Transferring…" : "Transfer stock"}
        </button>
      </form>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Stock by location</h2>
        <div className="field">
          <label htmlFor="itemFilter">Filter by item</label>
          <select id="itemFilter" value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
            <option value="">All items</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>

        {totalsByItem.length > 0 && (
          <div style={{ margin: "12px 0" }}>
            <div className="muted" style={{ fontWeight: 600, marginBottom: 4 }}>
              Combined total across all locations
            </div>
            {totalsByItem.map((t) => (
              <div key={t.item_name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span>{t.item_name}</span>
                <strong>
                  {t.total} {t.item_unit}
                </strong>
              </div>
            ))}
          </div>
        )}

        {filteredStock.length === 0 && <p className="muted">Nothing tracked yet.</p>}

        {filteredStock.map((s) => {
          const low = s.reorder_threshold > 0 && s.quantity_on_hand < s.reorder_threshold;
          const adj = getAdjustment(s.id);
          return (
            <div key={s.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{s.location_name}</strong>
                  <span className="muted"> — {s.item_name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {low && <span className="pill pill-low-stock">Low</span>}
                  <strong>
                    {s.quantity_on_hand} {s.item_unit}
                  </strong>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <label className="muted" style={{ fontWeight: 400 }}>
                  Reorder at{" "}
                  <input
                    type="number"
                    min={0}
                    defaultValue={s.reorder_threshold}
                    style={{ width: 70 }}
                    onBlur={(e) => handleThresholdChange(s, e.target.value)}
                  />
                </label>
                <input
                  type="number"
                  placeholder="+/- qty"
                  style={{ width: 90 }}
                  value={adj.delta}
                  onChange={(e) => setAdjustment(s.id, { delta: e.target.value })}
                />
                <select
                  value={adj.reason}
                  onChange={(e) => setAdjustment(s.id, { reason: e.target.value as "restock" | "manual_adjustment" })}
                >
                  <option value="restock">Restock</option>
                  <option value="manual_adjustment">Manual adjustment</option>
                </select>
                <button className="btn btn-secondary" onClick={() => handleAdjust(s)}>
                  Adjust
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {scanContext && (
        <Suspense fallback={null}>
          <BarcodeScanner onDetected={handleScanDetected} onClose={() => setScanContext(null)} />
        </Suspense>
      )}
    </div>
  );
}
