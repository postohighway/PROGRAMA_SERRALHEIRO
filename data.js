// data.js
// Camada de dados (Mock ou Supabase) com:
// - Multiempresa (RLS): injeta company_id automaticamente quando necessário
// - Compatibilidade com o front atual (Data.clients / Data.workorders / Data.reports)

import { uid, todayISO, monthISO, fmtMoney } from "./utils.js";
import { createClientIfConfigured } from "./supabaseClient.js";

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
// Company context (RLS)
// ---------------------------
async function getActiveCompanyId() {
  const s = getSavedSettings();
  if (s.activeCompanyId) return s.activeCompanyId;

  if (_mode === "mock") return "mock-company-1";

  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

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
// Mock DB
// ---------------------------
const mockDB = {
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
    company_id: mockDB.active_company_id,
    client_id: c1.id,
    desc: "Portão basculante",
    total: 3500,
    status: "aberto",
    deadline_days: 7,
    created_at: todayISO(),
  });

  mockDB.workorders.push({
    id: uid("os"),
    company_id: mockDB.active_company_id,
    client_id: c2.id,
    desc: "Grade de janela",
    status: "aberto",
    due_date: todayISO(),
    created_at: todayISO(),
    token: Math.random().toString(16).slice(2, 14),
    history: [{ at: new Date().toISOString(), action: "create", to_status: "aberto" }],
  });

  const m = monthISO(new Date());
  mockDB.txs.push(
    { id: uid("tx"), company_id: mockDB.active_company_id, type: "receber", desc: "Entrada Orçamento", amount: 500, due_date: `${m}-10`, category: "Serviços", status: "quitado" },
    { id: uid("tx"), company_id: mockDB.active_company_id, type: "pagar", desc: "Compra de material", amount: 240, due_date: `${m}-11`, category: "Materiais", status: "quitado" },
    { id: uid("tx"), company_id: mockDB.active_company_id, type: "receber", desc: "Saldo a receber", amount: 3000, due_date: `${m}-20`, category: "Serviços", status: "aberto" },
  );
}

// ---------------------------
// Supabase init
// ---------------------------
async function initFromSettings() {
  const s = getSavedSettings();
  setMode(s.mode || "mock");

  if (_mode === "supabase") {
    // Se o usuário não preencheu no painel, tenta usar config.local.js (se existir)
    let url = (s.supabaseUrl || "").trim();
    let key = (s.supabaseKey || "").trim();

    if (!url || !key) {
      try {
        const mod = await import("./config.local.js");
        url = url || (mod?.CONFIG?.SUPABASE_URL || "");
        key = key || (mod?.CONFIG?.SUPABASE_KEY || "");
      } catch {
        // sem config.local.js ou bloqueado
      }
    }

    _supabase = createClientIfConfigured(url, key);
    // se não configurou, mantém null (para o app mostrar erro amigável)
    return;
  }

  _supabase = null;
  ensureMockSeed();
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

  // define company ativa automaticamente (RLS)
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
// Helpers Mock CRUD
// ---------------------------
function mockList(table) {
  return [...mockDB[table]];
}
function mockGet(table, id) {
  return mockDB[table].find((x) => x.id === id) || null;
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
// IMPORTANTE: no banco real não existe mais "clients". Agora é "customers".
// Mantemos Data.clients por compatibilidade com o front.
const clients = {
  async list() {
    if (_mode === "mock") return mockList("clients");
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const { data, error } = await _supabase.from("customers").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("clients", payload);
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = { ...payload, company_id: companyId };

    const { data, error } = await _supabase.from("customers").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("clients", id, payload);
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const { data, error } = await _supabase.from("customers").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("clients", id);
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const { error } = await _supabase.from("customers").delete().eq("id", id);
    if (error) throw error;
  },
};

const quotes = {
  async list() {
    if (_mode === "mock") return mockList("quotes");
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const { data, error } = await _supabase.from("quotes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("quotes", payload);
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = payload?.company_id ? payload : { ...payload, company_id: companyId };

    const { data, error } = await _supabase.from("quotes").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("quotes", id, payload);
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const { data, error } = await _supabase.from("quotes").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("quotes", id);
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const { error } = await _supabase.from("quotes").delete().eq("id", id);
    if (error) throw error;
  },
};

const workorders = {
  // NOTE: apesar do nome interno "workorders", no banco usamos a tabela real "tickets".
  // Mapeamento:
  // - tickets.customer_id  -> client_id
  // - tickets.description  -> desc
  // - tickets.status       -> status (aberto|recebido|em_analise|concluido)
  // O histórico premium vem de public.ticket_history.
  async list() {
    if (_mode === "mock") return mockList("workorders");
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const { data, error } = await _supabase
      .from("tickets")
      .select("id, created_at, company_id, customer_id, description, status, token")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data || []).map((r) => ({
      id: r.id,
      company_id: r.company_id,
      client_id: r.customer_id,
      desc: r.description,
      status: r.status,
      due_date: null,
      created_at: r.created_at,
      token: r.token,
      history: [],
    }));
  },

  async get(id) {
    if (!id) return null;

    if (_mode === "mock") return mockGet("workorders", id);
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    // 1) ticket
    const { data: t, error: tErr } = await _supabase
      .from("tickets")
      .select("id, created_at, company_id, customer_id, description, status, token")
      .eq("id", id)
      .maybeSingle();

    if (tErr) throw tErr;
    if (!t) return null;

    // 2) histórico
    const { data: h, error: hErr } = await _supabase
      .from("ticket_history")
      .select("id, created_at, actor_user_id, action, from_status, to_status, note, meta, company_id")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (hErr) throw hErr;

    const history = (h || []).map((e) => ({
      id: e.id,
      at: e.created_at,
      action: e.action,
      from_status: e.from_status,
      to_status: e.to_status,
      note: e.note,
      actor_user_id: e.actor_user_id,
      meta: e.meta,
      company_id: e.company_id ?? null,
    }));

    return {
      id: t.id,
      company_id: t.company_id,
      client_id: t.customer_id,
      desc: t.description,
      status: t.status,
      due_date: null,
      created_at: t.created_at,
      token: t.token,
      history,
    };
  },

  async create(payload) {
    const companyId = _mode === "mock" ? mockDB.active_company_id : await getActiveCompanyId();
    if (_mode !== "mock" && !_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");
    if (_mode !== "mock" && !companyId) throw new Error("Não foi possível determinar a company ativa.");

    const base = {
      company_id: companyId,
      customer_id: payload.client_id || null,
      description: payload.desc || "",
      status: payload.status || "aberto",
      token: payload.token || Math.random().toString(16).slice(2, 14),
    };

    if (_mode === "mock") {
      const row = mockCreate("workorders", {
        id: uid("os"),
        company_id: base.company_id,
        client_id: base.customer_id,
        desc: base.description,
        status: base.status,
        due_date: null,
        created_at: todayISO(),
        token: base.token,
        history: [{ at: new Date().toISOString(), action: "create", to_status: base.status }],
      });
      return row;
    }

    const { data, error } = await _supabase
      .from("tickets")
      .insert(base)
      .select("id, created_at, company_id, customer_id, description, status, token")
      .single();

    if (error) throw error;

    return {
      id: data.id,
      company_id: data.company_id,
      client_id: data.customer_id,
      desc: data.description,
      status: data.status,
      due_date: null,
      created_at: data.created_at,
      token: data.token,
      history: [],
    };
  },

  async update(id, payload) {
    if (!id) throw new Error("Missing id");

    if (_mode === "mock") {
      return mockUpdate("workorders", id, { ...payload });
    }

    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const patch = {};
    if ("client_id" in payload) patch.customer_id = payload.client_id || null;
    if ("desc" in payload) patch.description = payload.desc || "";
    if ("status" in payload) patch.status = payload.status || "aberto";

    const { data, error } = await _supabase
      .from("tickets")
      .update(patch)
      .eq("id", id)
      .select("id, created_at, company_id, customer_id, description, status, token")
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      company_id: data.company_id,
      client_id: data.customer_id,
      desc: data.description,
      status: data.status,
      due_date: null,
      created_at: data.created_at,
      token: data.token,
      history: [],
    };
  },

  async remove(id) {
    if (!id) return;

    if (_mode === "mock") return mockRemove("workorders", id);

    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const { error } = await _supabase.from("tickets").delete().eq("id", id);
    if (error) throw error;
  },

  async addNote(ticketId, noteText) {
    const text = String(noteText || "").trim();
    if (!ticketId) throw new Error("Missing ticket id");
    if (!text) return await this.get(ticketId);

    if (_mode === "mock") {
      const wo = mockGet("workorders", ticketId);
      if (!wo) return null;
      const history = Array.isArray(wo.history) ? wo.history.slice() : [];
      history.push({ at: new Date().toISOString(), action: "note", note: text });
      mockUpdate("workorders", ticketId, { history });
      return mockGet("workorders", ticketId);
    }

    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    // tenta pegar user id (opcional)
    let actor_user_id = null;
    try {
      const { data } = await _supabase.auth.getUser();
      actor_user_id = data?.user?.id || null;
    } catch {
      actor_user_id = null;
    }

    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = {
      company_id: companyId,
      ticket_id: ticketId,
      actor_user_id,
      action: "note",
      from_status: null,
      to_status: null,
      note: text,
      meta: { source: "manual" },
    };

    const { error } = await _supabase.from("ticket_history").insert(row);
    if (error) throw error;

    return await this.get(ticketId);
  },
};

const txs = {
  async list() {
    if (_mode === "mock") return mockList("txs");
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const { data, error } = await _supabase.from("txs").select("*").order("due_date", { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("txs", payload);
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = payload?.company_id ? payload : { ...payload, company_id: companyId };

    const { data, error } = await _supabase.from("txs").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("txs", id, payload);
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const { data, error } = await _supabase.from("txs").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("txs", id);
    if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

    const { error } = await _supabase.from("txs").delete().eq("id", id);
    if (error) throw error;
  },
};

const reports = {
  async monthSummary(yyyyMm) {
    const list = await txs.list();
    const month = yyyyMm || monthISO(new Date());

    const inMonth = list.filter((t) => (t.due_date || "").startsWith(month));
    const ar = inMonth.filter((t) => t.type === "receber");
    const ap = inMonth.filter((t) => t.type === "pagar");

    const totalAR = ar.reduce((a, b) => a + Number(b.amount || 0), 0);
    const totalAP = ap.reduce((a, b) => a + Number(b.amount || 0), 0);

    const quitados = inMonth.filter((t) => t.status === "quitado");
    const cashIn = quitados.filter((t) => t.type === "receber").reduce((a, b) => a + Number(b.amount || 0), 0);
    const cashOut = quitados.filter((t) => t.type === "pagar").reduce((a, b) => a + Number(b.amount || 0), 0);

    const text =
`Resumo do mês ${month}
- A Receber: ${fmtMoney(totalAR)}
- A Pagar:   ${fmtMoney(totalAP)}
- Caixa (quitados): ${fmtMoney(cashIn - cashOut)}
`;

    const whatsappText = text.replace(/
/g, "
");
    return { text, whatsappText };
  },
};

export const Data = {
  initFromSettings,
  getSavedSettings,
  saveSettings,

  setMode,
  mode,

  // multiempresa
  getActiveCompanyId,
  setActiveCompanyId,

  // auth
  login,
  logout,

  // collections
  clients, // (tabela real: customers)
  quotes,
  workorders, // (tabela real: tickets + ticket_history)
  txs,

  // reports
  reports,

  // debug
  get supabase() {
    return _supabase;
  },
};
