// data.js
// Camada de dados (Mock + Supabase) para o "Sistema da Serralheria"
// Observação:
// - O front usa "clients", mas no banco (Supabase) usamos a tabela "customers".

console.log("[data.js] VERSION 2026-02-02A");

import { uid, todayISO, monthISO } from "./utils.js";
import { createClientIfConfigured } from "./supabaseClient.js";

const LS_KEY = "serralheria_settings_v1";

let _mode = "mock"; // "mock" | "supabase"
let _supabase = null;
let _supabaseSig = null; // url|key para evitar múltiplos clients

// ---------------------------
// Settings (localStorage)
// ---------------------------
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

// ---------------------------
// Mock DB
// ---------------------------
const mockDB = {
  session: null,
  active_company_id: "mock-company-1",
  clients: [],
  quotes: [],
  workorders: [],
  txs: [],
};

function ensureMockSeed() {
  if (mockDB.clients.length) return;

  const c1 = { id: uid("cli"), name: "Cliente Exemplo", phone: "(31) 99999-0000", address: "Rua A, 123", notes: "" };
  const c2 = { id: uid("cli"), name: "Maria Silva", phone: "(31) 98888-1111", address: "Rua B, 456", notes: "" };
  mockDB.clients.push(c1, c2);

  mockDB.quotes.push({
    id: uid("quo"),
    company_id: mockDB.active_company_id,
    ticket_id: null,
    status: "aberto",
    currency: "BRL",
    subtotal: 3500,
    discount: 0,
    surcharge: 0,
    total: 3500,
    sent_at: null,
    approved_at: null,
    rejected_at: null,
    approval_note: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const woId = uid("wo");
  mockDB.workorders.push({
    id: woId,
    company_id: mockDB.active_company_id,
    ticket_id: null,
    client_id: c2.id,
    desc: "Grade de janela",
    status: "producao",
    due_date: todayISO(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    history: [{ action: "create", at: new Date().toISOString(), to_status: "aberto" }],
  });

  const m = monthISO(new Date());
  mockDB.txs.push(
    { id: uid("tx"), company_id: mockDB.active_company_id, type: "receber", desc: "Entrada Orçamento", amount: 500, due_date: `${m}-10`, category: "Serviços", status: "quitado", created_at: new Date().toISOString() },
    { id: uid("tx"), company_id: mockDB.active_company_id, type: "pagar", desc: "Compra de material", amount: 240, due_date: `${m}-11`, category: "Materiais", status: "quitado", created_at: new Date().toISOString() },
    { id: uid("tx"), company_id: mockDB.active_company_id, type: "receber", desc: "Saldo a receber", amount: 3000, due_date: `${m}-20`, category: "Serviços", status: "aberto", created_at: new Date().toISOString() },
  );
}

// ---------------------------
// Supabase helpers
// ---------------------------
function mustSupabase() {
  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");
  return _supabase;
}

async function ensureSessionLoaded() {
  const sb = mustSupabase();

  // tenta ler sessão do storage
  let session = null;
  try {
    const { data } = await sb.auth.getSession();
    session = data?.session || null;
  } catch {}

  // se não veio, tenta refresh
  if (!session) {
    try {
      await sb.auth.refreshSession();
      const { data } = await sb.auth.getSession();
      session = data?.session || null;
    } catch {}
  }

  return session;
}

// ---------------------------
// Supabase init (COM CACHE)
// ---------------------------
async function initFromSettings() {
  const s = getSavedSettings();
  setMode(s.mode || "mock");

  if (_mode !== "supabase") {
    _supabase = null;
    _supabaseSig = null;
    ensureMockSeed();
    return;
  }

  if (!s.supabaseUrl || !s.supabaseKey) {
    _supabase = null;
    _supabaseSig = null;
    s.mode = "mock";
    saveSettings(s);
    setMode("mock");
    ensureMockSeed();
    return;
  }

  const sig = `${s.supabaseUrl}|${s.supabaseKey}`;

  // ✅ evita criar múltiplos clients
  if (!_supabase || _supabaseSig !== sig) {
    _supabase = createClientIfConfigured(s.supabaseUrl, s.supabaseKey);
    _supabaseSig = sig;
  }

  // força carregar sessão já no boot
  await ensureSessionLoaded();
}

// ---------------------------
// Company context (RLS / MULTIEMPRESAS)
// ---------------------------
async function getActiveCompanyId() {
  const s = getSavedSettings();

  // cache local
  if (typeof s.activeCompanyId === "string" && s.activeCompanyId.trim()) {
    return s.activeCompanyId;
  }

  if (_mode === "mock") return mockDB.active_company_id;

  const sb = mustSupabase();

  // ✅ garante sessão antes de consultar RLS
  const session = await ensureSessionLoaded();
  const userId = session?.user?.id || null;

  console.log("[getActiveCompanyId] session userId:", userId);

  const { data, error } = await sb
    .from("company_users")
    .select("company_id, created_at")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("[getActiveCompanyId] company_users error:", error);
    throw error;
  }

  console.log("[getActiveCompanyId] company_users data:", data);

  const companyId = data?.[0]?.company_id || null;

  if (companyId) {
    s.activeCompanyId = companyId;
    saveSettings(s);
    return companyId;
  }

  if (!userId) {
    throw new Error("Sessão do Supabase não carregou (usuário anon). Faça logout/login e tente novamente.");
  }

  throw new Error("Usuário autenticado, mas sem vínculo em company_users (ou RLS bloqueando).");
}

async function setActiveCompanyId(companyId) {
  const s = getSavedSettings();
  s.activeCompanyId = companyId;
  saveSettings(s);
  return companyId;
}

// ---------------------------
// AUTH
// ---------------------------
async function login(email, password) {
  if (_mode === "mock") {
    mockDB.session = { email };
    return true;
  }

  const sb = mustSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // limpa cache de empresa para recalcular
  const s = getSavedSettings();
  delete s.activeCompanyId;
  saveSettings(s);

  await ensureSessionLoaded();
  await getActiveCompanyId();

  return !!(data && data.session);
}

async function logout() {
  const s = getSavedSettings();
  delete s.activeCompanyId;
  saveSettings(s);

  if (_mode === "mock") {
    mockDB.session = null;
    return true;
  }
  if (_supabase) await _supabase.auth.signOut();
  return true;
}

// ---------------------------
// Mock helpers
// ---------------------------
function mockList(table) { return mockDB[table].slice(); }
function mockCreate(table, payload) {
  const row = { id: uid(table), ...payload };
  mockDB[table].push(row);
  return row;
}
function mockUpdate(table, id, payload) {
  const idx = mockDB[table].findIndex((x) => x.id === id);
  if (idx < 0) throw new Error("Item não encontrado.");
  mockDB[table][idx] = { ...mockDB[table][idx], ...payload };
  return mockDB[table][idx];
}
function mockRemove(table, id) {
  const idx = mockDB[table].findIndex((x) => x.id === id);
  if (idx >= 0) mockDB[table].splice(idx, 1);
}

// ---------------------------
// CLIENTS => CUSTOMERS
// ---------------------------
const clients = {
  async list() {
    if (_mode === "mock") return mockList("clients");
    const sb = mustSupabase();
    const { data, error } = await sb.from("customers").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("clients", payload);

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();

    const row = {
      company_id: companyId,
      name: payload?.name || "",
      phone: payload?.phone || "",
      email: payload?.email || null,
      address: payload?.address || null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await sb.from("customers").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("clients", id, payload);
    const sb = mustSupabase();
    const { data, error } = await sb.from("customers").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("clients", id);
    const sb = mustSupabase();
    const { error } = await sb.from("customers").delete().eq("id", id);
    if (error) throw error;
  },
};

// ---------------------------
// QUOTES
// ---------------------------
const quotes = {
  async list() {
    if (_mode === "mock") return mockList("quotes");
    const sb = mustSupabase();
    const { data, error } = await sb.from("quotes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
};

// ---------------------------
// WORKORDERS
// ---------------------------
const workorders = {
  async list() {
    if (_mode === "mock") return mockList("workorders");
    const sb = mustSupabase();
    const { data, error } = await sb.from("workorders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") {
      const row = mockCreate("workorders", { ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      row.history = [{ action: "create", at: new Date().toISOString(), to_status: row.status || "aberto" }];
      return row;
    }

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    const row = payload?.company_id ? payload : { ...payload, company_id: companyId };
    const { data, error } = await sb.from("workorders").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("workorders", id, { ...payload, updated_at: new Date().toISOString() });
    const sb = mustSupabase();
    const { data, error } = await sb.from("workorders").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("workorders", id);
    const sb = mustSupabase();
    const { error } = await sb.from("workorders").delete().eq("id", id);
    if (error) throw error;
  },
};

// ---------------------------
// TXS
// ---------------------------
const txs = {
  async list() {
    if (_mode === "mock") return mockList("txs");
    const sb = mustSupabase();
    const { data, error } = await sb.from("txs").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("txs", payload);

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();

    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = payload?.company_id ? payload : { ...payload, company_id: companyId };

    const { data, error } = await sb.from("txs").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },
};

// ---------------------------
// REPORTS
// ---------------------------
const reports = {
  monthSummary(list) {
    const map = {};
    const arr = Array.isArray(list) ? list : [];

    for (const tx of arr) {
      const due = String(tx?.due_date || "");
      const key = due.length >= 7 ? due.slice(0, 7) : "sem-data";

      if (!map[key]) map[key] = { receive: 0, pay: 0 };

      const amt = Number(tx?.amount || 0);
      if (tx?.type === "receber") map[key].receive += amt;
      else map[key].pay += amt;
    }

    return Object.entries(map)
      .map(([month, v]) => ({ month, receive: v.receive, pay: v.pay, result: v.receive - v.pay }))
      .sort((a, b) => (a.month > b.month ? 1 : -1));
  },
};

// ---------------------------
// Public API
// ---------------------------
export const Data = {
  initFromSettings,
  mode,
  setMode,
  saveSettings,
  getSavedSettings,

  login,
  logout,

  getActiveCompanyId,
  setActiveCompanyId,

  clients,
  quotes,
  workorders,
  txs,
  reports,

  get supabase() {
    return _supabase;
  },
};
