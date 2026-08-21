const TOKEN_KEY = "vogler_token";
const SESSION_KEY = "vogler_session";

export interface Session {
  is_admin: boolean;
  all_locations: boolean;
  can_view_receipts: boolean;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(options.body instanceof FormData) && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Receipt files are served from an authenticated route (not the public /uploads static
// route, since receipts are financial documents) — a plain <img>/<a> can't attach the
// Bearer token, so callers fetch the blob and open/render it via an object URL instead.
async function requestBlob(path: string): Promise<Blob> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error("Couldn't load file");
  return res.blob();
}

export interface Location {
  id: number;
  name: string;
  type: string;
}

export interface LocationDetail extends Location {
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
}

export interface Equipment {
  id: number;
  name: string;
  category: string | null;
}

export interface Ticket {
  id: number;
  location_id: number;
  location_name: string;
  equipment_id: number | null;
  equipment_name: string | null;
  issue_type: string;
  description: string;
  reporter_name: string | null;
  reporter_email: string | null;
  status: "new" | "acknowledged" | "in_progress" | "done" | "rejected" | "duplicate";
  status_notes: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  source: "web" | "sms" | "pm";
  created_at: string;
  photos?: { id: number; url: string; mime_type: string }[];
  parts?: TicketPart[];
}

export interface TicketPart {
  id: number;
  item_id: number;
  item_name: string;
  item_unit: string;
  location_id: number;
  location_name: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PmSchedule {
  id: number;
  location_id: number;
  location_name: string;
  equipment_id: number | null;
  equipment_name: string | null;
  title: string;
  issue_type: string;
  priority: "low" | "normal" | "high" | "urgent";
  interval_days: number;
  next_due_at: string;
  last_completed_at: string | null;
  current_ticket_id: number | null;
  active: boolean;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  is_admin: boolean;
  all_locations: boolean;
  can_view_receipts: boolean;
  locations: { id: number; name: string }[];
}

export interface InventoryItem {
  id: number;
  name: string;
  unit: string;
  notes: string | null;
  part_number: string | null;
  barcode: string | null;
  active: boolean;
}

export interface UpcLookupResult {
  found: boolean;
  name?: string;
  brand?: string;
}

export interface InventoryStock {
  id: number;
  item_id: number;
  item_name: string;
  item_unit: string;
  location_id: number;
  location_name: string;
  quantity_on_hand: number;
  reorder_threshold: number;
}

export interface InventoryTransaction {
  id: number;
  item_id: number;
  item_name: string;
  item_unit: string;
  location_id: number;
  location_name: string;
  quantity_delta: number;
  quantity_after: number;
  reason: "restock" | "manual_adjustment" | "ticket_use" | "pm_use" | "transfer_out" | "transfer_in";
  ticket_id: number | null;
  pm_schedule_id: number | null;
  notes: string | null;
  created_at: string;
}

export interface ItemUsage {
  item_id: number;
  quantity: number;
  notes?: string;
  // Source location to draw stock from — omit to default to the ticket's own location.
  location_id?: number;
}

export interface Asset {
  id: number;
  name: string;
  home_location_id: number;
  home_location_name: string;
  current_location_id: number;
  current_location_name: string;
  notes: string | null;
}

export interface ReceiptFile {
  id: number;
  receipt_id: number;
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
}

export interface Receipt {
  id: number;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
  description: string;
  amount: string | null;
  purchased_at: string;
  created_at: string;
  files: ReceiptFile[];
}

export const api = {
  login: (email: string, password: string) =>
    request<{
      token: string;
      user: {
        id: number;
        email: string;
        name: string | null;
        is_admin: boolean;
        all_locations: boolean;
        can_view_receipts: boolean;
      };
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),

  forgotPassword: (email: string) =>
    request<{ ok: boolean }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),

  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),

  getLocations: (includeVehicles = false) =>
    request<Location[]>(`/locations${includeVehicles ? "?include_vehicles=true" : ""}`),
  getLocationEquipment: (locationId: number) => request<Equipment[]>(`/locations/${locationId}/equipment`),
  getLocationsFull: () => request<LocationDetail[]>("/locations/full"),
  updateLocation: (id: number, data: { notes?: string }) =>
    request<LocationDetail>(`/locations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  submitTicket: (formData: FormData) =>
    request<{ id: number }>("/tickets", { method: "POST", body: formData }),

  getTickets: (params: { status?: string; exclude_status?: string[]; location_id?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    params.exclude_status?.forEach((s) => search.append("exclude_status", s));
    if (params.location_id) search.set("location_id", String(params.location_id));
    const qs = search.toString();
    return request<Ticket[]>(`/tickets${qs ? `?${qs}` : ""}`);
  },

  getTicket: (id: number) => request<Ticket>(`/tickets/${id}`),

  updateTicketStatus: (id: number, status: Ticket["status"], itemsUsed?: ItemUsage[], notes?: string) =>
    request<Ticket>(`/tickets/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        ...(itemsUsed?.length ? { items_used: itemsUsed } : {}),
        ...(notes !== undefined ? { notes } : {})
      })
    }),

  updateTicket: (
    id: number,
    data: Partial<{
      location_id: number;
      equipment_id: number | null;
      issue_type: string;
      description: string;
      priority: Ticket["priority"];
    }>
  ) => request<Ticket>(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteTicket: (id: number) => request<void>(`/tickets/${id}`, { method: "DELETE" }),

  updateTicketPart: (ticketId: number, partId: number, quantity: number) =>
    request<TicketPart[]>(`/tickets/${ticketId}/parts/${partId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity })
    }),

  deleteTicketPart: (ticketId: number, partId: number) =>
    request<TicketPart[]>(`/tickets/${ticketId}/parts/${partId}`, { method: "DELETE" }),

  getPmSchedules: () => request<PmSchedule[]>("/pm-schedules"),

  createPmSchedule: (data: {
    location_id: number;
    equipment_id?: number;
    title: string;
    issue_type: string;
    priority: string;
    interval_days: number;
    next_due_at: string;
  }) => request<PmSchedule>("/pm-schedules", { method: "POST", body: JSON.stringify(data) }),

  setPmScheduleActive: (id: number, active: boolean) =>
    request<PmSchedule>(`/pm-schedules/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }),

  completePmSchedule: (id: number, itemsUsed?: ItemUsage[]) =>
    request<PmSchedule>(`/pm-schedules/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(itemsUsed?.length ? { items_used: itemsUsed } : {})
    }),

  getUsers: () => request<User[]>("/users"),

  createUser: (data: {
    email: string;
    name?: string;
    password?: string;
    is_admin: boolean;
    all_locations: boolean;
    can_view_receipts: boolean;
    location_ids: number[];
  }) => request<{ id: number; email: string }>("/users", { method: "POST", body: JSON.stringify(data) }),

  updateUser: (
    id: number,
    data: Partial<{
      name: string;
      is_admin: boolean;
      all_locations: boolean;
      can_view_receipts: boolean;
      location_ids: number[];
    }>
  ) => request<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteUser: (id: number) => request<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" }),

  getInventoryItems: (includeInactive = false) =>
    request<InventoryItem[]>(`/inventory/items${includeInactive ? "?include_inactive=true" : ""}`),

  createInventoryItem: (data: { name: string; unit?: string; notes?: string; part_number?: string; barcode?: string }) =>
    request<InventoryItem>("/inventory/items", { method: "POST", body: JSON.stringify(data) }),

  updateInventoryItem: (
    id: number,
    data: Partial<{
      name: string;
      unit: string;
      notes: string | null;
      part_number: string | null;
      barcode: string | null;
      active: boolean;
    }>
  ) => request<InventoryItem>(`/inventory/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  lookupInventoryItemByBarcode: (barcode: string) =>
    request<InventoryItem>(`/inventory/items/lookup?barcode=${encodeURIComponent(barcode)}`),

  lookupUpc: (barcode: string) =>
    request<UpcLookupResult>(`/inventory/items/external-lookup?barcode=${encodeURIComponent(barcode)}`),

  getInventoryStock: () => request<InventoryStock[]>("/inventory/stock"),

  createInventoryStock: (data: {
    item_id: number;
    location_id: number;
    reorder_threshold?: number;
    quantity_on_hand?: number;
  }) => request<InventoryStock>("/inventory/stock", { method: "POST", body: JSON.stringify(data) }),

  updateInventoryThreshold: (stockId: number, reorderThreshold: number) =>
    request<InventoryStock>(`/inventory/stock/${stockId}`, {
      method: "PATCH",
      body: JSON.stringify({ reorder_threshold: reorderThreshold })
    }),

  adjustInventoryStock: (
    stockId: number,
    data: { quantity_delta: number; reason: "restock" | "manual_adjustment"; notes?: string }
  ) => request<InventoryStock>(`/inventory/stock/${stockId}/adjust`, { method: "POST", body: JSON.stringify(data) }),

  transferInventoryStock: (data: { item_id: number; from_location_id: number; to_location_id: number; quantity: number; notes?: string }) =>
    request<{
      ok: true;
      source: { id: number; quantity_on_hand: number; reorder_threshold: number };
      destination: { id: number; quantity_on_hand: number };
      crossedBelowThreshold: boolean;
    }>("/inventory/stock/transfer", { method: "POST", body: JSON.stringify(data) }),

  getInventoryTransactions: (params: { location_id?: number; item_id?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.location_id) search.set("location_id", String(params.location_id));
    if (params.item_id) search.set("item_id", String(params.item_id));
    const qs = search.toString();
    return request<InventoryTransaction[]>(`/inventory/transactions${qs ? `?${qs}` : ""}`);
  },

  getAssets: () => request<Asset[]>("/assets"),

  createAsset: (data: { name: string; home_location_id: number; notes?: string }) =>
    request<Asset>("/assets", { method: "POST", body: JSON.stringify(data) }),

  updateAsset: (
    id: number,
    data: Partial<{ name: string; home_location_id: number; current_location_id: number; notes: string }>
  ) => request<Asset>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteAsset: (id: number) => request<{ ok: boolean }>(`/assets/${id}`, { method: "DELETE" }),

  createReceipt: (formData: FormData) =>
    request<{ id: number }>("/receipts", { method: "POST", body: formData }),

  getReceipts: () => request<Receipt[]>("/receipts"),

  getReceiptFileBlob: (receiptId: number, fileId: number) => requestBlob(`/receipts/${receiptId}/files/${fileId}`)
};
