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

// --- Supabase init ---
async function initFromSettings() {
  const s = getSavedSettings();
  setMode(s.mode || "mock");

  if (_mode === "supabase") {
    if (!s.supabaseUrl || !s.supabaseKey) {
      // modo supabase selecionado mas sem credenciais → mantém sem cliente
      _supabase = null;
      return;
    }

    // Import dinâmico do client via CDN (browser)
    // Caso você já tenha um supabaseClient.js próprio, podemos mudar depois.
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
    _supabase = createClient(s.supabaseUrl, s.supabaseKey);
  } else {
    _supabase = null;
    ensureMockSeed();
  }
}

// --- AUTH ---
async function login(email, password) {
  if (_mode === "mock") {
    mockDB.session = { email };
    return true;
  }

  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return !!data?.session;
}

async function logout() {
  if (_mode === "mock") {
    mockDB.session = null;
    return;
  }
  if (_supabase) await _supabase.auth.signOut();
}

// --- Helpers Mock CRUD ---
function mockList(table) {
  return [...mockDB[table]];
}
function mockCreate(table, payload) {
  const row = { id: uid(table), ...payload };
  mockDB[table].push(row);
  return row;
}
function mockUpdate(table, id, payload) {
  const idx = mockDB[table].findIndex(x => x.id === id);
  if (idx < 0) throw new Error("Item não encontrado.");
  mockDB[table][idx] = { ...mockDB[table][idx], ...payload };
  return mockDB[table][idx];
}
function mockRemove(table, id) {
  const idx = mockDB[table].findIndex(x => x.id === id);
  if (idx < 0) return;
  mockDB[table].splice(idx, 1);
}

// --- Collections API (mock por enquanto / supabase depois) ---
const clients = {
  async list() {
    if (_mode === "mock") return mockList("clients");

    // Supabase: tabela "clients"
    const { data, error } = await _supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    if (_mode === "mock") return mockCreate("clients", payload);

    const { data, error } = await _supabase.from("clients").insert(payload).select("*").single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("clients", id, payload);

    const { data, error } = await _supabase.from("clients").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    if (_mode === "mock") return mockRemove("clients", id);

    const { error } = await _supabase.from("clients").delete().eq("id", id);
    if (error) throw error;
  },
};

const quotes = {
  async list() {
    if (_mode === "mock") return mockList("quotes");
    const { data, error } = await _supabase.from("quotes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    if (_mode === "mock") return mockCreate("quotes", payload);
    const { data, error } = await _supabase.from("quotes").insert(payload).select("*").single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("quotes", id, payload);
    const { data, error } = await _supabase.from("quotes").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    if (_mode === "mock") return mockRemove("quotes", id);
    const { error } = await _supabase.from("quotes").delete().eq("id", id);
    if (error) throw error;
  },
};

const workorders = {
  async list() {
    if (_mode === "mock") return mockList("workorders");
    const { data, error } = await _supabase.from("workorders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    if (_mode === "mock") return mockCreate("workorders", payload);
    const { data, error } = await _supabase.from("workorders").insert(payload).select("*").single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("workorders", id, payload);
    const { data, error } = await _supabase.from("workorders").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    if (_mode === "mock") return mockRemove("workorders", id);
    const { error } = await _supabase.from("workorders").delete().eq("id", id);
    if (error) throw error;
  },
};

const txs = {
  async list() {
    if (_mode === "mock") return mockList("txs");
    const { data, error } = await _supabase.from("txs").select("*").order("due_date", { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    if (_mode === "mock") return mockCreate("txs", payload);
    const { data, error } = await _supabase.from("txs").insert(payload).select("*").single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("txs", id, payload);
    const { data, error } = await _supabase.from("txs").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    if (_mode === "mock") return mockRemove("txs", id);
    const { error } = await _supabase.from("txs").delete().eq("id", id);
    if (error) throw error;
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
  getSavedSettings,
  saveSettings,
  setMode,
  mode,
  login,
  logout,
  clients,
  quotes,
  workorders,
  txs,
  reports,
};
