// data.js
// Camada de dados (Mock + Supabase) para o "Sistema da Serralheria"
// Observação importante:
// - O front usa "clients", mas no banco (Supabase) usamos a tabela "customers".

import { uid, todayISO, monthISO } from "./utils.js";

const LS_KEY = "serralheria_settings_v1";

let _mode = "mock"; // "mock" | "supabase"
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
// Supabase init (SINGLETON + SESSION SAFE)
// ---------------------------
async function initFromSettings() {
  const s = getSavedSettings();
  setMode(s.mode || "mock");

  if (_mode !== "supabase") {
    _supabase = null;
    ensureMockSeed();
    return;
  }

  if (!s.supabaseUrl || !s.supabaseKey) {
    _supabase = null;
    s.mode = "mock";
    saveSettings(s);
    setMode("mock");
    ensureMockSeed();
    return;
  }

  // Evita múltiplas instâncias (o warning que você está vendo)
  const sameClient =
    _supabase &&
    _supabase.__serralheria_url === s.supabaseUrl &&
    _supabase.__serralheria_key === s.supabaseKey;

  if (!sameClient) {
    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
    );

    _supabase = createClient(s.supabaseUrl, s.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // storageKey fixo para GitHub Pages / evitar colisões
        storageKey: "serralheria_auth_v1",
      },
    });

    _supabase.__serralheria_url = s.supabaseUrl;
    _supabase.__serralheria_key = s.supabaseKey;
  }

  // Força carregar a sessão do storage ANTES de queries com RLS
  try {
    await _supabase.auth.getSession();
  } catch {
    // não bloqueia init
  }
}

function mustSupabase() {
  if (!_supabase) throw new Error("Supabase não inicializado.");
  return _supabase;
}

async function requireSession() {
  const sb = mustSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  if (!data?.session) {
    // Isso elimina o “silêncio” que virava company_users=[]
    throw new Error("Sessão Supabase não carregada (JWT). Faça Sair, CTRL+F5 e entre novamente.");
  }
  return data.session;
}

// ---------------------------
// Company context (RLS)
// ---------------------------
async function getActiveCompanyId() {
  const s = getSavedSettings();
  if (s.activeCompanyId) return s.activeCompanyId;

  if (_mode === "mock") return mockDB.active_company_id;

  await requireSession();

  const { data, error } = await _supabase
    .from("company_users")
    .select("company_id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;

  const companyId = data && data[0] ? data[0].company_id : null;
  if (!companyId) {
    throw new Error("Não foi possível determinar a company ativa (company_users vazio).");
  }

  s.activeCompanyId = companyId;
  saveSettings(s);
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

  const sb = mustSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // garante company assim que logar
  await getActiveCompanyId();
  return !!(data && data.session);
}

async function logout() {
  // limpa cache de company para não “prender” estado ruim
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
// CLIENTS (front) => CUSTOMERS (db)
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
      name: payload && payload.name ? payload.name : "",
      phone: payload && payload.phone ? payload.phone : "",
      email: payload && payload.email ? payload.email : null,
      address: payload && payload.address ? payload.address : null,
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

  async create(payload) {
    if (_mode ===_
