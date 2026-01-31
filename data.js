// data.js
import { uid, todayISO, monthISO } from "./utils.js";

const LS_KEY = "serralheria_settings_v1";

let _mode = "mock";
let _supabase = null;

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
  // Mantemos o nome "clients" no mock para não quebrar telas antigas,
  // mas no supabase isso vai para "customers"
  clients: [],
  quotes: [],
  workorders: [],
  txs: [],
  session: null,
  active_company_id: "mock-company-1",
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
    client_id: c2.id,
    desc: "Grade de janela",
    status: "producao",
    due_date: todayISO(),
    created_at: todayISO(),
  });

  const m = monthISO(new Date());
  mockDB.txs.push(
    { id: uid("tx"), type: "receber", desc: "Entrada Orçamento", amount: 500, due_date: `${m}-10`, category: "Serviços", status: "quitado" },
    { id: uid("tx"), type: "pagar", desc: "Compra de material", amount: 240, due_date: `${m}-11`, category: "Materiais", status: "quitado" },
    { id: uid("tx"), type: "receber", desc: "Saldo a receber", amount: 3000, due_date: `${m}-20`, category: "Serviços", status: "aberto" },
  );
}

// ---------------------------
// Supabase init
// ---------------------------
async function initFromSettings() {
  const s = getSavedSettings();
  setMode(s.mode || "mock");

  if (_mode === "supabase") {
    if (!s.supabaseUrl || !s.supabaseKey) {
      _supabase = null;
      return;
    }

    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
    _supabase = createClient(s.supabaseUrl, s.supabaseKey);
  } else {
    _supabase = null;
    ensureMockSeed();
  }
}

// ---------------------------
// Company context (RLS)
// ---------------------------
async function getActiveCompanyId() {
  const s = getSavedSettings();
  if (s.activeCompanyId) return s.activeCompanyId;

  if (_mode === "mock") return mockDB.active_company_id;

  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

  // pega a primeira company do usuário logado
  const { data, error } = await _supabase
    .from("company_users")
    .select("company_id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;

  const companyId = data?.[0]?.company_id || null;
  if (companyId) {
    s.activeCompanyId = companyId;
    saveSettings(s);
  }
  return companyId;
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

  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // tenta definir company ativa automaticamente ao logar
  await getActiveCompanyId();

  return !!data?.session;
}

async function logout() {
  if (_mode === "mock") {
    mockDB.session = null;
    return;
  }
  if (_supabase) await _supabase.auth.signOut();
}

// ---------------------------
// Mock CRUD Helpers
// ---------------------------
function mockList(table) {
  return [...mockDB[table]];
}
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
  if (idx < 0) return;
  mockDB[table].splice(idx, 1);
}

// ---------------------------
// Collections API
// ---------------------------
// IMPORTANTE:
// - Mantemos o nome "clients" no frontend por compatibilidade,
//   mas no banco REAL agora é "customers".
const clients = {
  async list() {
    if (_mode === "mock") return mockList("clients");
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { data, error } = await _supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("clients", payload);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa do usuário.");

    const row = { ...payload, company_id: companyId };

    const { data, error } = await _supabase.from("customers").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("clients", id, payload);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { data, error } = await _supabase.from("customers").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("clients", id);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { error } = await _supabase.from("customers").delete().eq("id", id);
    if (error) throw error;
  },
};

const quotes = {
  async list() {
    if (_mode === "mock") return mockList("quotes");
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { data, error } = await _supabase.from("quotes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    if (_mode === "mock") return mockCreate("quotes", payload);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    // Se quotes tiver company_id no schema, injeta automaticamente quando não vier
    const companyId = await getActiveCompanyId();
    const row = payload?.company_id ? payload : { ...payload, company_id: companyId };

    const { data, error } = await _supabase.from("quotes").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("quotes", id, payload);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { data, error } = await _supabase.from("quotes").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    if (_mode === "mock") return mockRemove("quotes", id);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { error } = await _supabase.from("quotes").delete().eq("id", id);
    if (error) throw error;
  },
};

const workorders = {
  async list() {
    if (_mode === "mock") return mockList("workorders");
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { data, error } = await _supabase.from("workorders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    if (_mode === "mock") return mockCreate("workorders", payload);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const companyId = await getActiveCompanyId();
    const row = payload?.company_id ? payload : { ...payload, company_id: companyId };

    const { data, error } = await _supabase.from("workorders").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("workorders", id, payload);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { data, error } = await _supabase.from("workorders").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    if (_mode === "mock") return mockRemove("workorders", id);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { error } = await _supabase.from("workorders").delete().eq("id", id);
    if (error) throw error;
  },
};

const txs = {
  async list() {
    if (_mode === "mock") return mockList("txs");
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { data, error } = await _supabase.from("txs").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    if (_mode === "mock") return mockCreate("txs", payload);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const companyId = await getActiveCompanyId();
    const row = payload?.company_id ? payload : { ...payload, company_id: companyId };

    const { data, error } = await _supabase.from("txs").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("txs", id, payload);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { data, error } = await _supabase.from("txs").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    if (_mode === "mock") return mockRemove("txs", id);
    if (!_supabase) throw new Error("Supabase não inicializado.");

    const { error } = await _supabase.from("txs").delete().eq("id", id);
    if (error) throw error;
  },
};

// ---------------------------
// Public API
// ---------------------------
export const Data = {
  initFromSettings,
  mode,
  saveSettings,
  getSavedSettings,

  // auth
  login,
  logout,

  // company
  getActiveCompanyId,
  setActiveCompanyId,

  // collections
  clients,     // (na prática → customers)
  quotes,
  workorders,
  txs,

  // debug
  get supabase() {
    return _supabase;
  },
};
