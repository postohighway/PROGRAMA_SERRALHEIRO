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

  const c1 = {
    id: uid("cli"),
    name: "Cliente Exemplo",
    phone: "(31) 99999-0000",
    address: "Rua A, 123",
    notes: "",
  };
  const c2 = {
    id: uid("cli"),
    name: "Maria Silva",
    phone: "(31) 98888-1111",
    address: "Rua B, 456",
    notes: "",
  };
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
    history: [
      { action: "create", at: new Date().toISOString(), to_status: "aberto" },
    ],
  });

  const m = monthISO(new Date());
  mockDB.txs.push(
    {
      id: uid("tx"),
      company_id: mockDB.active_company_id,
      type: "receber",
      desc: "Entrada Orçamento",
      amount: 500,
      due_date: `${m}-10`,
      category: "Serviços",
      status: "quitado",
      created_at: new Date().toISOString(),
    },
    {
      id: uid("tx"),
      company_id: mockDB.active_company_id,
      type: "pagar",
      desc: "Compra de material",
      amount: 240,
      due_date: `${m}-11`,
      category: "Materiais",
      status: "quitado",
      created_at: new Date().toISOString(),
    },
    {
      id: uid("tx"),
      company_id: mockDB.active_company_id,
      type: "receber",
      desc: "Saldo a receber",
      amount: 3000,
      due_date: `${m}-20`,
      category: "Serviços",
      status: "aberto",
      created_at: new Date().toISOString(),
    }
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
      // fallback seguro para mock se marcar supabase sem configurar
      _supabase = null;
      s.mode = "mock";
      saveSettings(s);
      setMode("mock");
      ensureMockSeed();
      return;
    }

    // Reutiliza o client se URL/KEY não mudaram (evita warning de Multiple GoTrueClient)
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
          storageKey: "serralheria_auth_v1",
        },
      });

      _supabase.__serralheria_url = s.supabaseUrl;
      _supabase.__serralheria_key = s.supabaseKey;
    }

    // Garante sessão carregada do storage antes de queries com RLS
    try {
      await _supabase.auth.getSession();
    } catch (e) {
      console.warn("initFromSettings: getSession falhou:", e);
    }
  } else {
    _supabase = null;
    ensureMockSeed();
  }
}

function mustSupabase() {
  if (!_supabase)
    throw new Error(
      "Supabase não inicializado. Confira URL e Key em Configurações."
    );
  return _supabase;
}

// ---------------------------
// Company context
// ---------------------------
async function getActiveCompanyId() {
  const s = getSavedSettings();

  if (typeof s.activeCompanyId === "string" && s.activeCompanyId.trim()) {
    return s.activeCompanyId;
  }

  if (_mode === "mock") return mockDB.active_company_id;

  if (!_supabase)
    throw new Error(
      "Supabase não inicializado. Confira URL e Key em Configurações."
    );

  // Força carregar sessão (evita query como anon em alguns loads no GitHub Pages)
  let session = null;
  try {
    const { data: sess } = await _supabase.auth.getSession();
    session = sess?.session || null;
  } catch {}

  const uid = session?.user?.id || null;
  console.log("[getActiveCompanyId] uid:", uid);

  const { data, error } = await _supabase
    .from("company_users")
    .select("company_id, created_at")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("[getActiveCompanyId] company_users error:", error);
    throw error;
  }

  console.log("[getActiveCompanyId] company_users data:", data);

  const companyId = data && data[0] ? data[0].company_id : null;

  if (companyId && typeof companyId === "string") {
    s.activeCompanyId = companyId;
    saveSettings(s);
    return companyId;
  }

  // não tem vínculo (ou RLS/role bloqueou)
  return null;
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

  // tenta resolver company imediatamente (e cachear)
  try {
    await getActiveCompanyId();
  } catch (e) {
    console.warn("login: não conseguiu resolver company:", e);
  }

  return !!(data && data.session);
}

async function logout() {
  // limpa cache da company pra não “prender” estado ruim
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
function mockList(table) {
  return mockDB[table].slice();
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
  if (idx >= 0) mockDB[table].splice(idx, 1);
}

// ---------------------------
// CLIENTS (front) => CUSTOMERS (db)
// ---------------------------
const clients = {
  async list() {
    if (_mode === "mock") return mockList("clients");

    const sb = mustSupabase();
    const { data, error } = await sb
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("clients", payload);

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = {
      company_id: companyId,
      name: payload && payload.name ? payload.name : "",
      phone: payload && payload.phone ? payload.phone : "",
      email: payload && payload.email ? payload.email : null,
      address: payload && payload.address ? payload.address : null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await sb
      .from("customers")
      .insert(row)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("clients", id, payload);

    const sb = mustSupabase();
    const { data, error } = await sb
      .from("customers")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
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
    const { data, error } = await sb
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("quotes", payload);

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");
    const row =
      payload && payload.company_id ? payload : { ...payload, company_id: companyId };

    const { data, error } = await sb.from("quotes").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("quotes", id, payload);

    const sb = mustSupabase();
    const { data, error } = await sb
      .from("quotes")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("quotes", id);

    const sb = mustSupabase();
    const { error } = await sb.from("quotes").delete().eq("id", id);
    if (error) throw error;
  },
};

// ---------------------------
// WORKORDERS (mantém como está)
// ---------------------------
function parseStatusChangeBody(body) {
  const s = String(body || "");
  const parts = s.split("→");
  if (parts.length < 2) return { from_status: null, to_status: null };
  const from_status = parts[0].trim();
  const to_status = parts.slice(1).join("→").trim();
  return { from_status, to_status };
}

async function loadTicketHistoryFor(ticketId) {
  const sb = mustSupabase();
  const { data, error } = await sb
    .from("ticket_history")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const out = [];
  for (const ev of data || []) {
    const action = ev.event_type === "note" ? "note" : (ev.event_type || "");
    if (action === "status_change") {
      const st = parseStatusChangeBody(ev.body);
      out.push({
        action: "status_change",
        at: ev.created_at,
        from_status: st.from_status,
        to_status: st.to_status,
      });
      continue;
    }
    if (action === "create") {
      out.push({ action: "create", at: ev.created_at, to_status: "aberto" });
      continue;
    }
    if (action === "note") {
      out.push({ action: "note", at: ev.created_at, note: ev.body || "" });
      continue;
    }
    out.push({ action: action || "event", at: ev.created_at, note: ev.body || "" });
  }
  return out;
}

const workorders = {
  async list() {
    if (_mode === "mock") return mockList("workorders");

    const sb = mustSupabase();
    const { data, error } = await sb
      .from("workorders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async get(id) {
    if (_mode === "mock") {
      const wo = mockDB.workorders.find((x) => x.id === id);
      if (!wo) throw new Error("OS não encontrada.");
      return { ...wo, history: Array.isArray(wo.history) ? wo.history.slice() : [] };
    }

    const sb = mustSupabase();
    const { data, error } = await sb.from("workorders").select("*").eq("id", id).single();
    if (error) throw error;

    const wo = data;
    if (wo && wo.ticket_id) {
      try {
        wo.history = await loadTicketHistoryFor(wo.ticket_id);
      } catch {
        wo.history = [];
      }
    } else {
      wo.history = [];
    }
    return wo;
  },

  async create(payload) {
    if (_mode === "mock") {
      const row = mockCreate("workorders", {
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      row.history = [
        { action: "create", at: new Date().toISOString(), to_status: row.status || "aberto" },
      ];
      return row;
    }

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");
    const row =
      payload && payload.company_id ? payload : { ...payload, company_id: companyId };

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

  async addNote(workorderId, text) {
    const noteText = String(text || "").trim();
    if (!noteText) return null;

    if (_mode === "mock") {
      const wo = mockDB.workorders.find((x) => x.id === workorderId);
      if (!wo) throw new Error("OS não encontrada.");
      if (!Array.isArray(wo.history)) wo.history = [];
      wo.history.push({ action: "note", at: new Date().toISOString(), note: noteText });
      return { history: wo.history.slice() };
    }

    const sb = mustSupabase();

    const { data: wo, error: ewo } = await sb
      .from("workorders")
      .select("id,ticket_id,company_id")
      .eq("id", workorderId)
      .single();
    if (ewo) throw ewo;
    if (!wo || !wo.ticket_id)
      throw new Error("Esta OS não está ligada a um ticket (ticket_id vazio).");

    let ticketCompanyId = wo.company_id || null;
    try {
      const { data: t, error: et } = await sb
        .from("tickets")
        .select("company_id")
        .eq("id", wo.ticket_id)
        .single();
      if (!et && t && t.company_id) ticketCompanyId = t.company_id;
    } catch {}

    let authorName = null;
    let authorType = "usuario";
    try {
      const { data: u } = await sb.auth.getUser();
      if (u && u.user && u.user.email) authorName = u.user.email;
    } catch {}

    const row = {
      ticket_id: wo.ticket_id,
      company_id: ticketCompanyId,
      source: "message",
      event_type: "note",
      author_type: authorType,
      author_name: authorName,
      title: "Nota",
      body: noteText,
      meta: authorName
        ? { author_name: authorName, author_type: authorType }
        : { author_type: authorType },
    };

    const { error } = await sb.from("ticket_history").insert(row);
    if (error) throw error;

    const history = await loadTicketHistoryFor(wo.ticket_id);
    return { history };
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
    const row = payload && payload.company_id ? payload : { ...payload, company_id: companyId };

    const { data, error } = await sb.from("txs").insert(row).select("*").single();
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
  },
};

// ---------------------------
// REPORTS (sem regex)
// ---------------------------
const reports = {
  monthSummary(list) {
    const map = {};
    const arr = Array.isArray(list) ? list : [];

    for (const tx of arr) {
      const due = String(tx && tx.due_date ? tx.due_date : "");
      const key = due.length >= 7 ? due.slice(0, 7) : "sem-data";

      if (!map[key]) map[key] = { receive: 0, pay: 0 };

      const amt = Number(tx && tx.amount ? tx.amount : 0);
      if (tx && tx.type === "receber") map[key].receive += amt;
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
