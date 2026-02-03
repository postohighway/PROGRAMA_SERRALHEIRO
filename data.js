import { createClientIfConfigured } from "./supabaseClient.js";

export const VERSION = "2026-02-03A";
const LS_KEY = "serralheria_settings_v1";

/* ----------------------------- CONFIG LOADER ----------------------------- */
/**
 * Procura config nesta ordem:
 * 1) ./config.local.js  (ambiente local)
 * 2) ./config.js        (produção / GitHub Pages)
 * 3) ./config.example.js
 *
 * Os seus arquivos config.* exportam:  export const CONFIG = {...}
 */
async function loadConfigFromModules() {
  const candidates = ["./config.local.js", "./config.js", "./config.example.js"];

  for (const path of candidates) {
    try {
      // cache-buster para não ficar preso em config antigo
      const mod = await import(`${path}?v=${Date.now()}`);
      const cfg = mod?.CONFIG;
      if (!cfg) continue;

      const url = (cfg.SUPABASE_URL || "").trim();
      const key = (cfg.SUPABASE_KEY || "").trim();

      // ignora placeholders do example
      const looksPlaceholder =
        /COLE_AQUI/i.test(url) || /COLE_AQUI/i.test(key) || url.length < 10 || key.length < 10;

      if (!looksPlaceholder) {
        return { SUPABASE_URL: url, SUPABASE_KEY: key };
      }
    } catch (e) {
      // normal: arquivo pode não existir em produção/local
    }
  }
  return null;
}

/* ----------------------------- SETTINGS ----------------------------- */
function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function defaultSettings() {
  return {
    mode: "mock", // "mock" | "supabase"
    supabase_url: "",
    supabase_key: "",
    active_company_id: "",
    last_boot: null,
  };
}

export function getSavedSettings() {
  const raw = localStorage.getItem(LS_KEY);
  const parsed = raw ? safeJsonParse(raw) : null;
  return { ...defaultSettings(), ...(parsed || {}) };
}

export function saveSettings(patch) {
  const current = getSavedSettings();
  const next = { ...current, ...(patch || {}), last_boot: new Date().toISOString() };
  localStorage.setItem(LS_KEY, JSON.stringify(next));
  return next;
}

export function clearSettings() {
  localStorage.removeItem(LS_KEY);
}

/* ----------------------------- STATE ----------------------------- */
let supabase = null;
let mode = "mock";

/* ----------------------------- MOCK STORE ----------------------------- */
const mockDB = {
  txs: [
    // exemplo:
    // { id:"m1", type:"receber", desc:"Entrada", amount:500, due_date:"2026-02-10", category:"Serviços", status:"quitado", created_at:..., updated_at:... }
  ],
};

/* ----------------------------- HELPERS ----------------------------- */
function nowIso() {
  return new Date().toISOString();
}

function normalizeTxPayload(payload) {
  const p = { ...(payload || {}) };

  const type = String(p.type || "").toLowerCase();
  if (!["receber", "pagar"].includes(type)) {
    throw new Error("Tipo inválido. Use 'receber' ou 'pagar'.");
  }

  const desc = String(p.desc || "").trim();
  if (!desc) throw new Error("Descrição obrigatória.");

  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Valor inválido.");

  const due_date = String(p.due_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    throw new Error("Vencimento inválido. Use YYYY-MM-DD.");
  }

  const status = String(p.status || "aberto").toLowerCase();
  if (!["aberto", "quitado"].includes(status)) {
    throw new Error("Status inválido. Use 'aberto' ou 'quitado'.");
  }

  const category = p.category == null ? null : String(p.category).trim();

  return { type, desc, amount, due_date, category, status };
}

async function getUserIdOrThrow() {
  if (!supabase) throw new Error("Supabase não inicializado.");
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data?.user?.id;
  if (!userId) throw new Error("Usuário não autenticado.");
  return userId;
}

async function getActiveCompanyId() {
  const saved = getSavedSettings();

  // 1) se já tem salva e parece válida
  if (saved.active_company_id && String(saved.active_company_id).length > 10) {
    return saved.active_company_id;
  }

  // 2) tentar descobrir via company_users filtrando explicitamente por user_id
  const userId = await getUserIdOrThrow();

  const { data: memberships, error } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", userId);

  if (error) throw error;

  const ids = (memberships || []).map((m) => m.company_id).filter(Boolean);

  if (ids.length === 1) {
    saveSettings({ active_company_id: ids[0] });
    return ids[0];
  }

  if (ids.length > 1) {
    // por enquanto: escolhe o primeiro e salva (depois podemos criar UI de seleção)
    saveSettings({ active_company_id: ids[0] });
    return ids[0];
  }

  throw new Error("Não foi possível determinar a company ativa.");
}

/* ----------------------------- INIT ----------------------------- */
export async function initFromSettings() {
  const saved = getSavedSettings();

  // 1) Tenta completar settings a partir de config.* se estiver vazio
  if ((!saved.supabase_url || !saved.supabase_key) && typeof window !== "undefined") {
    const cfg = await loadConfigFromModules();
    if (cfg?.SUPABASE_URL && cfg?.SUPABASE_KEY) {
      saveSettings({
        supabase_url: cfg.SUPABASE_URL,
        supabase_key: cfg.SUPABASE_KEY,
        // se veio config válido, já muda para supabase automaticamente:
        mode: "supabase",
      });
    }
  }

  const s2 = getSavedSettings();
  mode = s2.mode || "mock";

  // 2) Instancia supabase se modo supabase E tem keys
  if (mode === "supabase") {
    supabase = createClientIfConfigured(s2.supabase_url, s2.supabase_key);
    if (!supabase) {
      // não derruba app: volta para mock
      console.warn("Supabase não configurado corretamente. Caindo para modo mock.");
      mode = "mock";
      supabase = null;
      saveSettings({ mode: "mock" });
    }
  } else {
    supabase = null;
  }

  console.log(`[data.js] VERSION ${VERSION}`);
  console.log(`[data.js] MODE: ${mode}`);
  return { mode, supabaseReady: !!supabase };
}

export function isSupabase() {
  return mode === "supabase" && !!supabase;
}

export function getSupabase() {
  return supabase;
}

/* ----------------------------- TXS (FINANCEIRO) ----------------------------- */
/**
 * Estratégia: Financeiro usa a tabela `txs` (central), com `company_id`.
 * Isso evita confusão com payments/purchases e views.
 */
async function txs_list_supabase({ month } = {}) {
  const companyId = await getActiveCompanyId();

  let q = supabase
    .from("txs")
    .select("id, company_id, type, desc, amount, due_date, category, status, created_at, updated_at")
    .eq("company_id", companyId)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: true });

  // month: "2026-02" => filtra intervalos [01..último dia]
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map((x) => Number(x));
    const start = `${month}-01`;
    const endDate = new Date(y, m, 0); // dia 0 do próximo mês => último do mês atual
    const end = `${month}-${String(endDate.getDate()).padStart(2, "0")}`;

    q = q.gte("due_date", start).lte("due_date", end);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function txs_list_mock() {
  return [...mockDB.txs].sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
}

async function txs_create_supabase(payload) {
  const companyId = await getActiveCompanyId();
  const tx = normalizeTxPayload(payload);

  const row = {
    company_id: companyId,
    type: tx.type,
    desc: tx.desc,
    amount: tx.amount,
    due_date: tx.due_date,
    category: tx.category,
    status: tx.status,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const { data, error } = await supabase.from("txs").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

function txs_create_mock(payload) {
  const tx = normalizeTxPayload(payload);
  const row = {
    id: `m_${Math.random().toString(16).slice(2)}`,
    company_id: "mock",
    ...tx,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  mockDB.txs.unshift(row);
  return row;
}

async function txs_update_supabase(id, patch) {
  const companyId = await getActiveCompanyId();
  const p = { ...(patch || {}) };
  if (p.amount != null) p.amount = Number(p.amount);
  if (p.desc != null) p.desc = String(p.desc).trim();
  if (p.due_date != null) p.due_date = String(p.due_date).trim();
  if (p.status != null) p.status = String(p.status).toLowerCase();
  if (p.type != null) p.type = String(p.type).toLowerCase();
  if (p.category != null) p.category = p.category === "" ? null : String(p.category).trim();

  p.updated_at = nowIso();

  const { data, error } = await supabase
    .from("txs")
    .update(p)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

function txs_update_mock(id, patch) {
  const idx = mockDB.txs.findIndex((x) => x.id === id);
  if (idx < 0) throw new Error("TX não encontrada.");
  mockDB.txs[idx] = { ...mockDB.txs[idx], ...(patch || {}), updated_at: nowIso() };
  return mockDB.txs[idx];
}

async function txs_remove_supabase(id) {
  const companyId = await getActiveCompanyId();
  const { error } = await supabase.from("txs").delete().eq("id", id).eq("company_id", companyId);
  if (error) throw error;
  return true;
}

function txs_remove_mock(id) {
  const before = mockDB.txs.length;
  mockDB.txs = mockDB.txs.filter((x) => x.id !== id);
  return mockDB.txs.length !== before;
}

/* ----------------------------- PUBLIC API ----------------------------- */
export const Data = {
  VERSION,

  // boot/config
  initFromSettings,
  getSavedSettings,
  saveSettings,
  clearSettings,
  isSupabase,
  supabase: () => supabase,

  // financeiro
  txs: {
    list: async (opts = {}) => {
      if (isSupabase()) return txs_list_supabase(opts);
      return txs_list_mock();
    },
    create: async (payload) => {
      if (isSupabase()) return txs_create_supabase(payload);
      return txs_create_mock(payload);
    },
    update: async (id, patch) => {
      if (isSupabase()) return txs_update_supabase(id, patch);
      return txs_update_mock(id, patch);
    },
    remove: async (id) => {
      if (isSupabase()) return txs_remove_supabase(id);
      return txs_remove_mock(id);
    },
  },

  // util (para debug rápido no console)
  _debug: {
    getActiveCompanyId,
  },
};
