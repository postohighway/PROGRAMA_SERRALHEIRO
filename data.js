// data.js (REESCRITO INTEIRO)
// Objetivo:
// - Manter a UI atual funcionando (clients/quotes/workorders/txs)
// - Suportar Supabase com BANCO NOVO (companies, company_users, customers, tickets, quotes, quote_items, payments, purchases, receivables...)
// - Suportar MULTIEMPRESA (SaaS) via seleção de company ativa
// - Continuar com modo MOCK

import { uid, todayISO, monthISO, fmtMoney } from "./utils.js";

const LS_KEY = "serralheria_settings_v2"; // v2 (inclui company)
const LS_COMPANY_KEY = "serralheria_active_company_v1";

let _mode = "mock";
let _supabase = null;

// Estado interno
let _activeCompanyId = null;
let _user = null; // session user (supabase)
let _companiesCache = []; // empresas do usuário

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

function getActiveCompanyId() {
  return _activeCompanyId;
}

function setActiveCompanyId(companyId) {
  _activeCompanyId = companyId || null;
  localStorage.setItem(LS_COMPANY_KEY, _activeCompanyId || "");
}

function getSavedCompanyId() {
  const v = localStorage.getItem(LS_COMPANY_KEY) || "";
  return v.trim() ? v.trim() : null;
}

/** =========================================================
 * MOCK DB
 * ======================================================= */
const mockDB = {
  session: null,
  companies: [{ id: "co_mock_1", name: "Serralheria Demo" }],
  activeCompanyId: "co_mock_1",

  // UI espera "clients"
  clients: [],
  // UI espera "quotes"
  quotes: [],
  // UI espera "workorders"
  workorders: [],
  // UI espera "txs"
  txs: [],
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

// CRUD helpers mock
function mockList(table) {
  return [...(mockDB[table] || [])];
}
function mockCreate(table, payload) {
  const row = { id: uid(table), ...payload };
  mockDB[table] = mockDB[table] || [];
  mockDB[table].push(row);
  return row;
}
function mockUpdate(table, id, payload) {
  mockDB[table] = mockDB[table] || [];
  const idx = mockDB[table].findIndex(x => x.id === id);
  if (idx < 0) throw new Error("Item não encontrado.");
  mockDB[table][idx] = { ...mockDB[table][idx], ...payload };
  return mockDB[table][idx];
}
function mockRemove(table, id) {
  mockDB[table] = mockDB[table] || [];
  const idx = mockDB[table].findIndex(x => x.id === id);
  if (idx < 0) return;
  mockDB[table].splice(idx, 1);
}

/** =========================================================
 * SUPABASE INIT + MULTIEMPRESA
 * ======================================================= */
async function initFromSettings() {
  const s = getSavedSettings();
  setMode(s.mode || "mock");

  if (_mode === "supabase") {
    if (!s.supabaseUrl || !s.supabaseKey) {
      _supabase = null;
      return;
    }

    // Supabase client via CDN (browser)
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
    _supabase = createClient(s.supabaseUrl, s.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    // Se já existe sessão, carregar usuário + empresas + company ativa
    const { data } = await _supabase.auth.getSession();
    _user = data?.session?.user || null;

    if (_user) {
      await refreshCompanies();
      const savedCompany = getSavedCompanyId();
      if (savedCompany && _companiesCache.some(c => c.id === savedCompany)) {
        setActiveCompanyId(savedCompany);
      } else {
        // padrão: primeira empresa
        setActiveCompanyId(_companiesCache[0]?.id || null);
      }
    }
  } else {
    _supabase = null;
    _user = null;
    _companiesCache = [];
    _activeCompanyId = mockDB.activeCompanyId;
    ensureMockSeed();
  }
}

async function refreshCompanies() {
  if (_mode === "mock") {
    _companiesCache = [...mockDB.companies];
    _activeCompanyId = mockDB.activeCompanyId;
    return _companiesCache;
  }

  if (!_supabase) throw new Error("Supabase não inicializado.");
  const { data: sess } = await _supabase.auth.getSession();
  _user = sess?.session?.user || null;
  if (!_user) {
    _companiesCache = [];
    _activeCompanyId = null;
    return [];
  }

  // company_users: (user_id, company_id) → companies
  const { data: links, error: e1 } = await _supabase
    .from("company_users")
    .select("company_id, role, companies:company_id(id, name, trade_name)")
    .eq("user_id", _user.id);

  if (e1) throw e1;

  const companies = (links || [])
    .map(x => x.companies)
    .filter(Boolean);

  // dedupe
  const map = new Map();
  for (const c of companies) map.set(c.id, c);
  _companiesCache = Array.from(map.values());

  return _companiesCache;
}

// Exposto para UI futura (se quiser selecionar empresa)
const companies = {
  async listMine() {
    if (_mode === "mock") return [...mockDB.companies];
    return await refreshCompanies();
  },
  getActiveId() {
    if (_mode === "mock") return mockDB.activeCompanyId;
    return _activeCompanyId;
  },
  async setActive(companyId) {
    if (_mode === "mock") {
      mockDB.activeCompanyId = companyId;
      _activeCompanyId = companyId;
      return;
    }
    // valida se pertence ao usuário
    if (!_companiesCache.some(c => c.id === companyId)) {
      throw new Error("Empresa inválida para este usuário.");
    }
    setActiveCompanyId(companyId);
  },
};

function requireCompany() {
  const cid = companies.getActiveId();
  if (!cid) throw new Error("Nenhuma empresa ativa. (company_id)");
  return cid;
}

/** =========================================================
 * AUTH
 * ======================================================= */
async function login(email, password) {
  if (_mode === "mock") {
    mockDB.session = { email };
    _activeCompanyId = mockDB.activeCompanyId;
    return true;
  }

  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  _user = data?.user || null;
  await refreshCompanies();

  const savedCompany = getSavedCompanyId();
  if (savedCompany && _companiesCache.some(c => c.id === savedCompany)) {
    setActiveCompanyId(savedCompany);
  } else {
    setActiveCompanyId(_companiesCache[0]?.id || null);
  }

  return !!data?.session;
}

async function logout() {
  if (_mode === "mock") {
    mockDB.session = null;
    return;
  }
  if (_supabase) await _supabase.auth.signOut();
  _user = null;
  _companiesCache = [];
  _activeCompanyId = null;
}

/** =========================================================
 * MAPS: UI ↔ Banco novo
 * ======================================================= */

// customers <-> clients (UI)
function mapCustomerToClientRow(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    notes: "", // UI tinha notes; banco novo não tem — pode virar coluna depois se quiser
    created_at: row.created_at,
  };
}

function mapClientPayloadToCustomer(payload) {
  const cid = requireCompany();
  return {
    company_id: cid,
    name: payload.name || "",
    phone: payload.phone || "",
    email: payload.email || null,
    address: payload.address || "",
  };
}

// tickets <-> workorders (UI)
function mapTicketToWorkorderRow(t) {
  return {
    id: t.id,
    client_id: t.customer_id || null, // UI usa client_id
    desc: t.description || "",
    status: t.status || "producao",
    due_date: t.due_date || "", // se não existir no banco, fica vazio
    created_at: (t.created_at || "").slice(0, 10),
    token: t.token,
  };
}

function mapWorkorderPayloadToTicket(payload) {
  const cid = requireCompany();
  return {
    company_id: cid,
    customer_id: payload.client_id || null,
    description: payload.desc || "",
    status: payload.status || "producao",
    // Se você quiser ter "due_date" no ticket, adicione a coluna no banco.
    // Por enquanto, mantemos no front só como informação visual.
  };
}

// quotes (UI) <-> quotes (banco) [mapeia campos antigos]
// UI: {id, client_id, desc, total, status, deadline_days, created_at}
// Banco: quotes {id, ticket_id, status, total, created_at, ...}
// Aqui: vamos associar quote ao ticket (e ticket ao customer) no futuro.
// Para não travar agora, mantemos quote como entidade ligada a ticket_id (obrigatório no banco).
// A UI atual cria orçamento sem ticket: vamos criar primeiro um ticket "container" se necessário.

async function ensureTicketForCustomer(customerId, descForTicket = "Orçamento") {
  const cid = requireCompany();
  // cria um ticket mínimo para servir de vínculo do orçamento
  const payload = {
    company_id: cid,
    customer_id: customerId || null,
    description: descForTicket || "Orçamento",
    status: "producao",
    token: uid("tok"),
  };
  const { data, error } = await _supabase.from("tickets").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

/** =========================================================
 * COLLECTIONS API (mantém interface antiga do app.js)
 * ======================================================= */

const clients = {
  async list() {
    if (_mode === "mock") return mockList("clients");

    if (!_supabase) throw new Error("Supabase não inicializado.");
    const cid = requireCompany();

    const { data, error } = await _supabase
      .from("customers")
      .select("*")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(mapCustomerToClientRow);
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("clients", payload);

    const row = mapClientPayloadToCustomer(payload);
    const { data, error } = await _supabase.from("customers").insert(row).select("*").single();
    if (error) throw error;
    return mapCustomerToClientRow(data);
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("clients", id, payload);

    const cid = requireCompany();
    const upd = mapClientPayloadToCustomer(payload);
    // company_id não deve mudar no update
    delete upd.company_id;

    const { data, error } = await _supabase
      .from("customers")
      .update(upd)
      .eq("id", id)
      .eq("company_id", cid)
      .select("*")
      .single();

    if (error) throw error;
    return mapCustomerToClientRow(data);
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("clients", id);

    const cid = requireCompany();
    const { error } = await _supabase.from("customers").delete().eq("id", id).eq("company_id", cid);
    if (error) throw error;
  },
};

const workorders = {
  async list() {
    if (_mode === "mock") return mockList("workorders");

    const cid = requireCompany();
    const { data, error } = await _supabase
      .from("tickets")
      .select("*")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(mapTicketToWorkorderRow);
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("workorders", payload);

    const row = mapWorkorderPayloadToTicket(payload);
    // token obrigatório para link público
    row.token = uid("tok");

    const { data, error } = await _supabase.from("tickets").insert(row).select("*").single();
    if (error) throw error;
    return mapTicketToWorkorderRow(data);
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("workorders", id, payload);

    const cid = requireCompany();
    const upd = mapWorkorderPayloadToTicket(payload);
    delete upd.company_id;

    const { data, error } = await _supabase
      .from("tickets")
      .update(upd)
      .eq("id", id)
      .eq("company_id", cid)
      .select("*")
      .single();

    if (error) throw error;
    return mapTicketToWorkorderRow(data);
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("workorders", id);

    const cid = requireCompany();
    // soft-delete (se quiser hard delete, altere aqui)
    const { error } = await _supabase
      .from("tickets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", cid);

    if (error) throw error;
  },
};

// quotes: mantém “modo compat” com UI atual
const quotes = {
  async list() {
    if (_mode === "mock") return mockList("quotes");

    const cid = requireCompany();
    const { data, error } = await _supabase
      .from("quotes")
      .select("*, tickets:ticket_id(id, customer_id, description)")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Adaptar para formato antigo do front
    return (data || []).map(q => ({
      id: q.id,
      client_id: q.tickets?.customer_id || null,
      desc: q.tickets?.description || "Orçamento",
      total: Number(q.total || 0),
      status: q.status || "aberto",
      deadline_days: 7, // UI antiga tinha isso; pode virar campo depois
      created_at: (q.created_at || "").slice(0, 10),
      ticket_id: q.ticket_id,
    }));
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("quotes", payload);

    const cid = requireCompany();
    const customerId = payload.client_id || null;

    // banco exige ticket_id → cria ticket mínimo se não vier um ticket_id
    let ticketId = payload.ticket_id || null;
    if (!ticketId) {
      const t = await ensureTicketForCustomer(customerId, payload.desc || "Orçamento");
      ticketId = t.id;
    }

    const row = {
      company_id: cid,
      ticket_id: ticketId,
      status: payload.status || "draft",
      currency: "BRL",
      subtotal: Number(payload.total || 0),
      discount: 0,
      surcharge: 0,
      total: Number(payload.total || 0),
    };

    const { data, error } = await _supabase.from("quotes").insert(row).select("*").single();
    if (error) throw error;

    return {
      id: data.id,
      client_id: customerId,
      desc: payload.desc || "Orçamento",
      total: Number(data.total || 0),
      status: data.status,
      deadline_days: payload.deadline_days || 7,
      created_at: (data.created_at || "").slice(0, 10),
      ticket_id: data.ticket_id,
    };
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("quotes", id, payload);

    const cid = requireCompany();
    const upd = {};
    if (payload.status) upd.status = payload.status;
    if (payload.total != null) {
      upd.subtotal = Number(payload.total || 0);
      upd.total = Number(payload.total || 0);
    }

    const { data, error } = await _supabase
      .from("quotes")
      .update(upd)
      .eq("id", id)
      .eq("company_id", cid)
      .select("*")
      .single();

    if (error) throw error;

    return {
      id: data.id,
      client_id: payload.client_id || null,
      desc: payload.desc || "Orçamento",
      total: Number(data.total || 0),
      status: data.status,
      deadline_days: payload.deadline_days || 7,
      created_at: (data.created_at || "").slice(0, 10),
      ticket_id: data.ticket_id,
    };
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("quotes", id);

    const cid = requireCompany();
    const { error } = await _supabase.from("quotes").delete().eq("id", id).eq("company_id", cid);
    if (error) throw error;
  },
};

/**
 * FINANCE (txs)
 * UI atual trabalha com "txs" genérica.
 * No banco novo você tem:
 * - payments (recebimentos de serviços)
 * - purchases (saídas/custos)
 * - receivables (cobranças recorrentes) -> depende de contract_id
 *
 * Para não travar a UI agora:
 * - txs.list() agrega payments + purchases (e pode incluir receivables depois)
 * - create/update/remove:
 *    - type='pagar' -> purchases
 *    - type='receber' -> payments
 * OBS: "A receber" como títulos futuros (sem pagamento) é mais complexo e vamos evoluir depois.
 */
function mapPaymentToTx(p) {
  const due = (p.paid_at ? String(p.paid_at).slice(0, 10) : todayISO());
  return {
    id: `pay_${p.id}`,
    type: "receber",
    desc: p.note || "Recebimento",
    amount: Number(p.amount || 0),
    due_date: due,
    category: "Serviços",
    status: p.paid_at ? "quitado" : "aberto",
    _source: "payments",
    _source_id: p.id,
  };
}

function mapPurchaseToTx(x) {
  const due = x.date || todayISO();
  return {
    id: `pur_${x.id}`,
    type: "pagar",
    desc: x.description || "Compra",
    amount: Number(x.value || 0),
    due_date: due,
    category: "Materiais",
    status: "quitado", // purchases hoje não tem "status"; tratamos como realizado
    _source: "purchases",
    _source_id: x.id,
  };
}

const txs = {
  async list() {
    if (_mode === "mock") return mockList("txs");
    const cid = requireCompany();

    const [{ data: pays, error: e1 }, { data: purs, error: e2 }] = await Promise.all([
      _supabase.from("payments").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      _supabase.from("purchases").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
    ]);

    if (e1) throw e1;
    if (e2) throw e2;

    const list = [
      ...(pays || []).map(mapPaymentToTx),
      ...(purs || []).map(mapPurchaseToTx),
    ];

    // ordenar por due_date
    list.sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")));
    return list;
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("txs", payload);
    const cid = requireCompany();

    if (payload.type === "pagar") {
      // purchases: {company_id, description, value, invoice_number, date}
      const row = {
        company_id: cid,
        description: payload.desc || "Compra",
        value: Number(payload.amount || 0),
        invoice_number: payload.invoice_number || null,
        date: payload.due_date || todayISO(),
      };
      const { data, error } = await _supabase.from("purchases").insert(row).select("*").single();
      if (error) throw error;
      return mapPurchaseToTx(data);
    }

    // receber -> payments
    const row = {
      company_id: cid,
      ticket_id: payload.ticket_id || null, // pode associar depois
      quote_id: payload.quote_id || null,
      amount: Number(payload.amount || 0),
      method: payload.method || "pix",
      paid_at: payload.status === "quitado" ? new Date().toISOString() : null,
      note: payload.desc || null,
    };

    // ticket_id é NOT NULL no banco? No seu schema payments.ticket_id é NOT NULL.
    // Então, se não tiver ticket_id, precisamos criar um ticket "financeiro" (mínimo).
    if (!row.ticket_id) {
      const t = await ensureTicketForCustomer(null, payload.desc || "Recebimento");
      row.ticket_id = t.id;
    }

    const { data, error } = await _supabase.from("payments").insert(row).select("*").single();
    if (error) throw error;
    return mapPaymentToTx(data);
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("txs", id, payload);

    // id vem como pay_xxx ou pur_xxx
    const cid = requireCompany();

    if (String(id).startsWith("pur_")) {
      const realId = String(id).slice(4);
      const upd = {
        description: payload.desc,
        value: payload.amount != null ? Number(payload.amount || 0) : undefined,
        date: payload.due_date || undefined,
      };
      // limpar undefined
      Object.keys(upd).forEach(k => upd[k] === undefined && delete upd[k]);

      const { data, error } = await _supabase
        .from("purchases")
        .update(upd)
        .eq("id", realId)
        .eq("company_id", cid)
        .select("*")
        .single();
      if (error) throw error;
      return mapPurchaseToTx(data);
    }

    if (String(id).startsWith("pay_")) {
      const realId = String(id).slice(4);
      const upd = {
        amount: payload.amount != null ? Number(payload.amount || 0) : undefined,
        method: payload.method || undefined,
        note: payload.desc || undefined,
      };
      if (payload.status) {
        upd.paid_at = payload.status === "quitado" ? new Date().toISOString() : null;
      }
      Object.keys(upd).forEach(k => upd[k] === undefined && delete upd[k]);

      const { data, error } = await _supabase
        .from("payments")
        .update(upd)
        .eq("id", realId)
        .eq("company_id", cid)
        .select("*")
        .single();
      if (error) throw error;
      return mapPaymentToTx(data);
    }

    throw new Error("ID inválido para update de tx.");
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("txs", id);

    const cid = requireCompany();

    if (String(id).startsWith("pur_")) {
      const realId = String(id).slice(4);
      const { error } = await _supabase.from("purchases").delete().eq("id", realId).eq("company_id", cid);
      if (error) throw error;
      return;
    }
    if (String(id).startsWith("pay_")) {
      const realId = String(id).slice(4);
      const { error } = await _supabase.from("payments").delete().eq("id", realId).eq("company_id", cid);
      if (error) throw error;
      return;
    }

    throw new Error("ID inválido para remoção de tx.");
  },
};

const reports = {
  async monthSummary(yyyyMm) {
    const list = await txs.list();
    const month = yyyyMm || monthISO(new Date());

    const inMonth = list.filter(t => (t.due_date || "").startsWith(month));
    const ar = inMonth.filter(t => t.type === "receber");
    const ap = inMonth.filter(t => t.type === "pagar");

    const totalAR = ar.reduce((a, b) => a + Number(b.amount || 0), 0);
    const totalAP = ap.reduce((a, b) => a + Number(b.amount || 0), 0);

    const quitados = inMonth.filter(t => t.status === "quitado");
    const cashIn = quitados.filter(t => t.type === "receber").reduce((a, b) => a + Number(b.amount || 0), 0);
    const cashOut = quitados.filter(t => t.type === "pagar").reduce((a, b) => a + Number(b.amount || 0), 0);

    const text =
`Resumo do mês ${month}
- A Receber: ${fmtMoney(totalAR)}
- A Pagar:   ${fmtMoney(totalAP)}
- Caixa (quitados): ${fmtMoney(cashIn - cashOut)}
`;

    const whatsappText = text.replace(/\n/g, "\n");
    return { text, whatsappText };
  },
};

export const Data = {
  initFromSettings,
