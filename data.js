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
export function getSavedSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSettings(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s || {}));
}

export function setMode(m) {
  _mode = m;
}

// ---------------------------
// Mock DB (seed simples)
// ---------------------------
const mockDB = {
  session: null,
  active_company_id: "mock-company-1",

  customers: [
    { id: "c1", company_id: "mock-company-1", name: "Cliente A", phone: "(34) 99999-0000", city: "Uberlândia" },
    { id: "c2", company_id: "mock-company-1", name: "Cliente B", phone: "(34) 98888-1111", city: "Uberlândia" },
  ],
  quotes: [],
  quote_items: [],
  workorders: [],
  txs: [
    { id: "t1", company_id: "mock-company-1", type: "receber", desc: "Serviço X", amount: 500, due_date: todayISO(), category: "Serviços", status: "aberto", created_at: new Date().toISOString() },
  ],
};

function ensureMockSeed() {
  // se quiser seed adicional no futuro, aqui é o lugar
}

function seedDemoDataIfEmpty() {
  // opcional: preenche dados se estiver vazio
  if (mockDB.txs.length === 0) {
    const m = monthISO(new Date());
    mockDB.txs.push(
      { id: "tseed1", company_id: "mock-company-1", type: "receber", desc: "Venda balcão", amount: 1200, due_date: `${m}-05`, category: "Vendas", status: "aberto", created_at: new Date().toISOString() },
      { id: "tseed2", company_id: "mock-company-1", type: "pagar", desc: "Fornecedor", amount: 300, due_date: `${m}-10`, category: "Compras", status: "aberto", created_at: new Date().toISOString() },
      { id: "tseed3", company_id: "mock-company-1", type: "pagar", desc: "Aluguel", amount: 900, due_date: `${m}-20`, category: "Fixos", status: "aberto", created_at: new Date().toISOString() },
    );
  }
}

// ---------------------------
// Supabase init
// ---------------------------
async function initFromSettings() {
  const s = getSavedSettings();
  setMode(s.mode || "mock");

  if (_mode === "supabase") {
    if (!s.supabaseUrl || !s.supabaseKey) {
      // Fallback seguro: se o usuário marcou "Supabase" mas não configurou URL/Key,
      // a aplicação ficava travada em modo supabase sem client inicializado.
      // Aqui a gente volta para mock e informa via status no login.
      _supabase = null;
      s.mode = "mock";
      saveSettings(s);
      setMode("mock");
      ensureMockSeed();
      return;
    }

    // Evita múltiplas instâncias do GoTrueClient no mesmo contexto (warning do console)
    // Recria o client apenas se URL/KEY mudarem.
    const sameClient =
      _supabase &&
      _supabase.__serralheria_url === s.supabaseUrl &&
      _supabase.__serralheria_key === s.supabaseKey;

    if (!sameClient) {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      _supabase = createClient(s.supabaseUrl, s.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // storageKey fixo para evitar colisões com outras apps no mesmo domínio
          storageKey: "serralheria_auth_v1",
        },
      });

      // tags internas para detectar mudança de config
      _supabase.__serralheria_url = s.supabaseUrl;
      _supabase.__serralheria_key = s.supabaseKey;
    }

    // Garante que a sessão já foi carregada do storage antes de qualquer query com RLS
    try {
      await _supabase.auth.getSession();
    } catch {
      // não bloqueia init
    }
  } else {
    _supabase = null;
    ensureMockSeed();
  }
}

function mustSupabase() {
  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");
  return _supabase;
}

// ---------------------------
// Multi-empresa (company ativa)
// ---------------------------
async function getActiveCompanyId() {
  const s = getSavedSettings();
  if (s.activeCompanyId) return s.activeCompanyId;

  if (_mode === "mock") return mockDB.active_company_id;

  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

  const { data, error } = await _supabase
    .from("company_users")
    .select("company_id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;

  const companyId = data && data[0] ? data[0].company_id : null;
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

  const sb = mustSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // depois de logar, tenta resolver a company ativa
  await getActiveCompanyId();
  return !!(data && data.session);
}

async function logout() {
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
  if (idx < 0) throw new Error("Item não encontrado");
  mockDB[table][idx] = { ...mockDB[table][idx], ...payload };
  return mockDB[table][idx];
}
function mockRemove(table, id) {
  const idx = mockDB[table].findIndex((x) => x.id === id);
  if (idx < 0) return true;
  mockDB[table].splice(idx, 1);
  return true;
}

// ---------------------------
// Collections
// ---------------------------
const clients = {
  async list() {
    if (_mode === "mock") return mockList("customers");
    const sb = mustSupabase();
    const { data, error } = await sb.from("customers").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    if (_mode === "mock") return mockCreate("customers", payload);
    const sb = mustSupabase();
    const company_id = await getActiveCompanyId();
    if (!company_id) throw new Error("Não foi possível determinar a company ativa.");
    const { data, error } = await sb.from("customers").insert([{ ...payload, company_id }]).select("*").single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("customers", id, payload);
    const sb = mustSupabase();
    const { data, error } = await sb.from("customers").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    if (_mode === "mock") return mockRemove("customers", id);
    const sb = mustSupabase();
    const { error } = await sb.from("customers").delete().eq("id", id);
    if (error) throw error;
    return true;
  },
};

const quotes = {
  async list() {
    if (_mode === "mock") return mockList("quotes");
    const sb = mustSupabase();
    const { data, error } = await sb.from("quotes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    if (_mode === "mock") return mockCreate("quotes", payload);
    const sb = mustSupabase();
    const company_id = await getActiveCompanyId();
    if (!company_id) throw new Error("Não foi possível determinar a company ativa.");
    const { data, error } = await sb.from("quotes").insert([{ ...payload, company_id }]).select("*").single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("quotes", id, payload);
    const sb = mustSupabase();
    const { data, error } = await sb.from("quotes").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    if (_mode === "mock") return mockRemove("quotes", id);
    const sb = mustSupabase();
    const { error } = await sb.from("quotes").delete().eq("id", id);
    if (error) throw error;
    return true;
  },
};

const workorders = {
  async list() {
    if (_mode === "mock") return mockList("workorders");
    const sb = mustSupabase();
    const { data, error } = await sb.from("workorders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    if (_mode === "mock") return mockCreate("workorders", payload);
    const sb = mustSupabase();
    const company_id = await getActiveCompanyId();
    if (!company_id) throw new Error("Não foi possível determinar a company ativa.");
    const { data, error } = await sb.from("workorders").insert([{ ...payload, company_id }]).select("*").single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("workorders", id, payload);
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
    return true;
  },
};

const txs = {
  async list() {
    if (_mode === "mock") {
      seedDemoDataIfEmpty();
      return mockList("txs").sort((a, b) => (b.due_date || "").localeCompare(a.due_date || ""));
    }
    const sb = mustSupabase();
    const { data, error } = await sb.from("txs").select("*").order("due_date", { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    if (_mode === "mock") return mockCreate("txs", payload);
    const sb = mustSupabase();
    const company_id = await getActiveCompanyId();
    if (!company_id) throw new Error("Não foi possível determinar a company ativa.");

    const row = {
      company_id,
      type: payload.type,
      desc: payload.desc ?? "",
      amount: Number(payload.amount ?? 0),
      due_date: payload.due_date ?? null,
      category: payload.category ?? null,
      status: payload.status ?? "aberto",
    };

    const { data, error } = await sb.from("txs").insert([row]).select("*").single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("txs", id, payload);
    const sb = mustSupabase();
    const { data, error } = await sb.from("txs").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    if (_mode === "mock") return mockRemove("txs", id);
    const sb = mustSupabase();
    const { error } = await sb.from("txs").delete().eq("id", id);
    if (error) throw error;
    return true;
  },
};

// ---------------------------
// Reports (placeholder)
// ---------------------------
const reports = {
  async financeSummary() {
    const rows = await txs.list();
    const ar = rows.filter((r) => r.type === "receber");
    const ap = rows.filter((r) => r.type === "pagar");
    const sum = (arr) => arr.reduce((acc, x) => acc + Number(x.amount || 0), 0);
    return {
      a_receber: sum(ar),
      a_pagar: sum(ap),
      saldo: sum(ar) - sum(ap),
      total_rows: rows.length,
    };
  },
};

// ---------------------------
// Public API
// ---------------------------
export const Data = {
  initFromSettings,

  // mode/settings
  setMode,
  saveSettings,
  getSavedSettings,

  // auth
  login,
  logout,

  // company
  getActiveCompanyId,
  setActiveCompanyId,

  // collections
  clients, // (db: customers)
  quotes,
  workorders,
  txs,

  // reports
  reports,

  // debug
  get supabase() {
    return _supabase;
  },
};
