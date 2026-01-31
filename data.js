const App = (() => {

  function init() {
    console.log("App iniciado");
  }

  function enterDemo() {
    try {
      Data.saveSettings({
        mode: "mock"
      });
// data.js
import { uid, todayISO, monthISO, fmtMoney } from "./utils.js";

const LS_KEY = "serralheria_settings_v1";

let _mode = "mock";
let _supabase = null;

function getSavedSettings() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSettings(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj || {}));
}

function setMode(m) {
  _mode = m === "supabase" ? "supabase" : "mock";
}

function mode() {
  return _mode;
}

// --- Mock DB ---
const mockDB = {
  clients: [],
  quotes: [],
  workorders: [],
  txs: [],
  session: null,
};

function ensureMockSeed() {
  if (mockDB.clients.length > 0) return;

  const c1 = { id: uid("cli"), name: "Cliente Exemplo", phone: "(31) 99999-0000", address: "Rua A, 123", notes: "" };
  const c2 = { id: uid("cli"), name: "Maria Silva", phone: "(31) 98888-1111", address: "Rua B, 456", notes: "" };
  mockDB.clients.push(c1, c2);

  mockDB.quotes.push({
    id: uid("orc"),
    client_id: c1.id,
    desc: "Portão basculante",
    total: 3500,
    status: "aberto",
    deadline_days: 7,
    created_at: todayISO(),
  });

  mockDB.workorders.push({
    id: uid("os"),
    client_id: c1.id,
    desc: "Troca de fechadura",
    status: "aberto",
    due_date: todayISO(),
    created_at: todayISO(),
    updated_at: todayISO(),
  });

  mockDB.txs.push(
    { id: uid("tx"), type: "receber", desc: "Sinal do portão", value: 800, status: "aberto", due_date: todayISO(), created_at: todayISO() },
    { id: uid("tx"), type: "pagar", desc: "Material (ferro)", value: 420, status: "pago", due_date: todayISO(), created_at: todayISO() }
  );
}

// --- Supabase init ---
async function initFromSettings() {
  const s = getSavedSettings();
  const m = s.mode || "mock";
  setMode(m);

  if (mode() === "supabase") {
    const url = (s.supabaseUrl || "").trim();
    const key = (s.supabaseKey || "").trim();

    if (!url || !key) {
      throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");
    }

    // Import dinâmico pra evitar quebrar no modo mock
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
    _supabase = createClient(url, key);
  } else {
    _supabase = null;
    ensureMockSeed();
  }
}

async function login(email, password) {
  if (mode() === "mock") {
    mockDB.session = { user: { email } };
    return true;
  }

  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return !!data?.session;
}

async function logout() {
  if (mode() === "mock") {
    mockDB.session = null;
    return true;
  }
  if (!_supabase) return true;
  const { error } = await _supabase.auth.signOut();
  if (error) throw error;
  return true;
}

// --- Generic helpers ---
function assertSupabase() {
  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");
}

function normalizeClient(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    notes: row.notes || "",
    created_at: row.created_at,
  };
}

// --- Clients ---
async function clients_list(search = "") {
  if (mode() === "mock") {
    ensureMockSeed();
    const q = (search || "").trim().toLowerCase();
    let rows = [...mockDB.clients];
    if (q) {
      rows = rows.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.phone || "").toLowerCase().includes(q));
    }
    rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return rows;
  }

  assertSupabase();
  let query = _supabase.from("clients").select("*").order("name", { ascending: true });

  const q = (search || "").trim();
  if (q) {
    // busca simples por nome/telefone (pode ajustar p/ ilike)
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeClient);
}

async function clients_insert(payload) {
  if (mode() === "mock") {
    ensureMockSeed();
    const row = {
      id: uid("cli"),
      name: payload.name || "",
      phone: payload.phone || "",
      address: payload.address || "",
      notes: payload.notes || "",
      created_at: todayISO(),
    };
    mockDB.clients.push(row);
    return row;
  }

  assertSupabase();
  const { data, error } = await _supabase.from("clients").insert(payload).select("*").single();
  if (error) throw error;
  return normalizeClient(data);
}

async function clients_update(id, payload) {
  if (mode() === "mock") {
    ensureMockSeed();
    const idx = mockDB.clients.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error("Cliente não encontrado.");
    mockDB.clients[idx] = { ...mockDB.clients[idx], ...payload };
    return mockDB.clients[idx];
  }

  assertSupabase();
  const { data, error } = await _supabase.from("clients").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return normalizeClient(data);
}

// --- Quotes ---
async function quotes_list() {
  if (mode() === "mock") {
    ensureMockSeed();
    return [...mockDB.quotes].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }
  assertSupabase();
  const { data, error } = await _supabase.from("quotes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function quote_items_list(quote_id) {
  if (mode() === "mock") return [];
  assertSupabase();
  const { data, error } = await _supabase.from("quote_items").select("*").eq("quote_id", quote_id).order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function quotes_insert(payload) {
  if (mode() === "mock") {
    ensureMockSeed();
    const row = {
      id: uid("orc"),
      company_id: null,
      ticket_id: null,
      status: "aberto",
      currency: "BRL",
      subtotal: payload.subtotal ?? 0,
      discount: payload.discount ?? 0,
      surcharge: payload.surcharge ?? 0,
      total: payload.total ?? 0,
      sent_at: null,
      approved_at: null,
      rejected_at: null,
      approval_note: null,
      created_at: todayISO(),
      updated_at: todayISO(),
    };
    mockDB.quotes.push(row);
    return row;
  }

  assertSupabase();
  const { data, error } = await _supabase.from("quotes").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

// --- Workorders / Tickets ---
async function workorders_list() {
  if (mode() === "mock") {
    ensureMockSeed();
    return [...mockDB.workorders].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }
  assertSupabase();
  const { data, error } = await _supabase.from("workorders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function tickets_list() {
  if (mode() === "mock") return [];
  assertSupabase();
  const { data, error } = await _supabase.from("tickets").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function ticket_messages_list(ticket_id) {
  if (mode() === "mock") return [];
  assertSupabase();
  const { data, error } = await _supabase.from("ticket_messages").select("*").eq("ticket_id", ticket_id).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function ticket_history_list(ticket_id) {
  if (mode() === "mock") return [];
  assertSupabase();
  const { data, error } = await _supabase.from("ticket_history").select("*").eq("ticket_id", ticket_id).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function ticket_checklist_get(ticket_id) {
  if (mode() === "mock") return null;
  assertSupabase();
  const { data, error } = await _supabase.from("ticket_checklist").select("*").eq("ticket_id", ticket_id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function ticket_checklist_upsert(ticket_id, payload) {
  if (mode() === "mock") return true;
  assertSupabase();
  const row = { ticket_id, ...payload };
  const { error } = await _supabase.from("ticket_checklist").upsert(row);
  if (error) throw error;
  return true;
}

// --- Finance / txs ---
async function txs_list(type = null) {
  if (mode() === "mock") {
    ensureMockSeed();
    const rows = [...mockDB.txs];
    const filtered = type ? rows.filter((t) => t.type === type) : rows;
    return filtered.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  }

  assertSupabase();
  let q = _supabase.from("txs").select("*").order("due_date", { ascending: true });
  if (type) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function txs_insert(payload) {
  if (mode() === "mock") {
    ensureMockSeed();
    const row = {
      id: uid("tx"),
      type: payload.type,
      desc: payload.desc || "",
      value: payload.value || 0,
      status: payload.status || "aberto",
      due_date: payload.due_date || todayISO(),
      created_at: todayISO(),
    };
    mockDB.txs.push(row);
    return row;
  }

  assertSupabase();
  const { data, error } = await _supabase.from("txs").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

// --- Reports ---
async function report_month(month = monthISO()) {
  const rows = await txs_list(null);
  const monthPrefix = (month || "").slice(0, 7);

  const inMonth = rows.filter((t) => (t.due_date || "").slice(0, 7) === monthPrefix);

  const ar = inMonth.filter((t) => t.type === "receber");
  const ap = inMonth.filter((t) => t.type === "pagar");

  const sum = (arr) => arr.reduce((acc, t) => acc + Number(t.value || 0), 0);
  const sumPaid = (arr) => arr.filter((t) => t.status === "pago").reduce((acc, t) => acc + Number(t.value || 0), 0);

  const totalAR = sum(ar);
  const totalAP = sum(ap);
  const cashIn = sumPaid(ar);
  const cashOut = sumPaid(ap);

  const text = `Resumo Financeiro — ${monthPrefix}
- A Receber: ${fmtMoney(totalAR)}
- A Pagar:   ${fmtMoney(totalAP)}
- Caixa (quitados): ${fmtMoney(cashIn - cashOut)}
`;

  const whatsappText = text.replace(/\n/g, "\n");
  return { text, whatsappText };
}

export const Data = {
  initFromSettings,
  getSavedSettings,
  saveSettings,
  setMode,
  mode,
  login,
  logout,
  clients: {
    list: clients_list,
    insert: clients_insert,
    update: clients_update,
  },
  quotes: {
    list: quotes_list,
    insert: quotes_insert,
    items: {
      list: quote_items_list,
    },
  },
  workorders: {
    list: workorders_list,
  },
  tickets: {
    list: tickets_list,
    messages: {
      list: ticket_messages_list,
    },
    history: {
      list: ticket_history_list,
    },
    checklist: {
      get: ticket_checklist_get,
      upsert: ticket_checklist_upsert,
    },
  },
  txs: {
    list: txs_list,
    insert: txs_insert,
  },
  reports: {
    month: report_month,
  },
};
      location.reload();
    } catch (e) {
      console.error("Erro ao entrar em demo:", e);
    }
  }

  function login(email, password) {
    const settings = Data.getSavedSettings();

    if (settings.mode === "supabase") {
      alert("Login real ainda será implementado");
      return;
    }

    enterDemo();
  }

  return {
    init,
    login,
    enterDemo
  };

})();

document.addEventListener("DOMContentLoaded", App.init);
