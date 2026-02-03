// data.js
// Data layer (Mock + Supabase)
// Financeiro definitivo:
// - A RECEBER  => public.payments
// - A PAGAR    => public.purchases
// - LISTAGEM   => public.txs_view (read-only)

console.log("[data.js] VERSION 2026-02-03 FINANCE-MIGRATION");

import { uid, todayISO, monthISO } from "./utils.js";
import { createClientIfConfigured } from "./supabaseClient.js";

const LS_KEY = "serralheria_settings_v1";

let _mode = "mock"; // "mock" | "supabase"
let _supabase = null;
let _supabaseSig = null;

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
  // financeiro (mock) no formato da txs_view
  finance: [],
};

function ensureMockSeed() {
  if (mockDB.clients.length) return;

  const c1 = { id: uid("cli"), name: "Cliente Exemplo", phone: "(31) 99999-0000", address: "Rua A, 123", notes: "" };
  const c2 = { id: uid("cli"), name: "Maria Silva", phone: "(31) 98888-1111", address: "Rua B, 456", notes: "" };
  mockDB.clients.push(c1, c2);

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
  mockDB.finance.push(
    {
      company_id: mockDB.active_company_id,
      id: uid("pay"),
      type: "receber",
      desc: "Entrada Orçamento",
      amount: 500,
      due_date: `${m}-10`,
      category: null,
      status: "quitado",
      source_table: "payments",
      created_at: new Date().toISOString(),
    },
    {
      company_id: mockDB.active_company_id,
      id: uid("pur"),
      type: "pagar",
      desc: "Compra de material",
      amount: 240,
      due_date: `${m}-11`,
      category: null,
      status: "aberto",
      source_table: "purchases",
      created_at: new Date().toISOString(),
    },
    {
      company_id: mockDB.active_company_id,
      id: uid("pay"),
      type: "receber",
      desc: "Saldo a receber",
      amount: 3000,
      due_date: `${m}-20`,
      category: null,
      status: "aberto",
      source_table: "payments",
      created_at: new Date().toISOString(),
    }
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

  let session = null;
  try {
    const { data } = await sb.auth.getSession();
    session = data?.session || null;
  } catch {}

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

  if (!_supabase || _supabaseSig !== sig) {
    _supabase = createClientIfConfigured(s.supabaseUrl, s.supabaseKey);
    _supabaseSig = sig;
  }

  await ensureSessionLoaded();
}

// ---------------------------
// Company context (RLS / MULTIEMPRESAS)
// ---------------------------
async function getActiveCompanyId() {
  const s = getSavedSettings();

  if (typeof s.activeCompanyId === "string" && s.activeCompanyId.trim()) {
    return s.activeCompanyId;
  }

  if (_mode === "mock") return mockDB.active_company_id;

  const sb = mustSupabase();
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

  // trava company ativa no login
  const cid = await getActiveCompanyId();
  console.log("LOGIN COMPANY FIXED:", cid);

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
// CLIENTS => CUSTOMERS
// ---------------------------
const clients = {
  async list() {
    if (_mode === "mock") return mockDB.clients.slice();
    const sb = mustSupabase();
    const { data, error } = await sb.from("customers").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") {
      const row = { id: uid("cli"), ...payload };
      mockDB.clients.push(row);
      return row;
    }

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
    if (_mode === "mock") {
      const idx = mockDB.clients.findIndex((x) => x.id === id);
      if (idx < 0) throw new Error("Cliente não encontrado.");
      mockDB.clients[idx] = { ...mockDB.clients[idx], ...payload };
      return mockDB.clients[idx];
    }

    const sb = mustSupabase();
    const { data, error } = await sb.from("customers").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") {
      const idx = mockDB.clients.findIndex((x) => x.id === id);
      if (idx >= 0) mockDB.clients.splice(idx, 1);
      return;
    }

    const sb = mustSupabase();
    const { error } = await sb.from("customers").delete().eq("id", id);
    if (error) throw error;
  },
};

// ---------------------------
// WORKORDERS
// ---------------------------
const workorders = {
  async list() {
    if (_mode === "mock") return mockDB.workorders.slice();
    const sb = mustSupabase();
    const { data, error } = await sb.from("workorders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") {
      const row = {
        id: uid("wo"),
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDB.workorders.push(row);
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
    if (_mode === "mock") {
      const idx = mockDB.workorders.findIndex((x) => x.id === id);
      if (idx < 0) throw new Error("OS não encontrada.");
      mockDB.workorders[idx] = { ...mockDB.workorders[idx], ...payload, updated_at: new Date().toISOString() };
      return mockDB.workorders[idx];
    }

    const sb = mustSupabase();
    const { data, error } = await sb.from("workorders").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") {
      const idx = mockDB.workorders.findIndex((x) => x.id === id);
      if (idx >= 0) mockDB.workorders.splice(idx, 1);
      return;
    }

    const sb = mustSupabase();
    const { error } = await sb.from("workorders").delete().eq("id", id);
    if (error) throw error;
  },
};

// ---------------------------
// FINANCEIRO (novo)
// ---------------------------
const finance = {
  // listagem consolidada
  async list() {
    if (_mode === "mock") return mockDB.finance.slice().sort((a, b) => (a.due_date < b.due_date ? 1 : -1));

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();

    const { data, error } = await sb
      .from("txs_view")
      .select("*")
      .eq("company_id", companyId)
      .order("due_date", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // cria lançamento: decide tabela base
  async create(payload) {
    const type = payload?.type;

    if (type !== "receber" && type !== "pagar") {
      throw new Error("Tipo inválido. Use 'receber' ou 'pagar'.");
    }

    if (_mode === "mock") {
      const companyId = mockDB.active_company_id;
      const row = {
        company_id: companyId,
        id: uid(type === "receber" ? "pay" : "pur"),
        type,
        desc: String(payload?.desc || "").trim(),
        amount: Number(payload?.amount || 0),
        due_date: payload?.due_date || todayISO(),
        category: payload?.category ?? null,
        status: payload?.status || "aberto",
        source_table: type === "receber" ? "payments" : "purchases",
        created_at: new Date().toISOString(),
      };
      mockDB.finance.push(row);
      return row;
    }

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();

    if (type === "receber") {
      // payments: (company_id, amount, note, paid_at?, created_at/updated_at defaults)
      const insertRow = {
        company_id: companyId,
        amount: Number(payload?.amount || 0),
        note: String(payload?.desc || "").trim() || null,
        // se vier quitado, marca paid_at agora
        paid_at: payload?.status === "quitado" ? new Date().toISOString() : null,
      };

      const { data, error } = await sb.from("payments").insert(insertRow).select("*").single();
      if (error) throw error;
      return data;
    }

    // pagar => purchases: (company_id, value, description, date, paid_at?)
    const insertRow = {
      company_id: companyId,
      value: Number(payload?.amount || 0),
      description: String(payload?.desc || "").trim() || null,
      date: payload?.due_date || todayISO(),
      paid_at: payload?.status === "quitado" ? new Date().toISOString() : null,
    };

    const { data, error } = await sb.from("purchases").insert(insertRow).select("*").single();
    if (error) throw error;
    return data;
  },

  // marcar como quitado (respeita origem)
  async markPaid(item) {
    const source = item?.source_table;
    const id = item?.id;

    if (!id) throw new Error("ID inválido.");

    if (_mode === "mock") {
      const idx = mockDB.finance.findIndex((x) => x.id === id && x.source_table === source);
      if (idx >= 0) mockDB.finance[idx].status = "quitado";
      return true;
    }

    const sb = mustSupabase();
    const paid_at = new Date().toISOString();

    if (source === "payments") {
      const { error } = await sb.from("payments").update({ paid_at }).eq("id", id);
      if (error) throw error;
      return true;
    }

    if (source === "purchases") {
      const { error } = await sb.from("purchases").update({ paid_at }).eq("id", id);
      if (error) throw error;
      return true;
    }

    throw new Error("Origem desconhecida no financeiro (source_table).");
  },

  async unpay(item) {
    const source = item?.source_table;
    const id = item?.id;

    if (!id) throw new Error("ID inválido.");

    if (_mode === "mock") {
      const idx = mockDB.finance.findIndex((x) => x.id === id && x.source_table === source);
      if (idx >= 0) mockDB.finance[idx].status = "aberto";
      return true;
    }

    const sb = mustSupabase();

    if (source === "payments") {
      const { error } = await sb.from("payments").update({ paid_at: null }).eq("id", id);
      if (error) throw error;
      return true;
    }

    if (source === "purchases") {
      const { error } = await sb.from("purchases").update({ paid_at: null }).eq("id", id);
      if (error) throw error;
      return true;
    }

    throw new Error("Origem desconhecida no financeiro (source_table).");
  },
};

// ---------------------------
// REPORTS (baseado na listagem consolidada)
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
  workorders,

  // ✅ novo financeiro
  finance,
  reports,

  get supabase() {
    return _supabase;
  },
};
