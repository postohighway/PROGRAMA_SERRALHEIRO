// data.js
// Camada de dados do sistema (mock + supabase)
// Versão: bootstrap robusto + singleton supabase client

let _mode = "mock"; // "mock" | "supabase"
let _supabase = null;
let _settings = getSavedSettings() || { supabaseUrl: "", supabaseAnonKey: "", activeCompanyId: "" };

// ---------------------------
// SETTINGS
// ---------------------------

const LS_KEY = "SERRALHERIA_SETTINGS_V1";

function getSavedSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return {
      supabaseUrl: obj?.supabaseUrl || "",
      supabaseAnonKey: obj?.supabaseAnonKey || "",
      activeCompanyId: obj?.activeCompanyId || "",
    };
  } catch {
    return null;
  }
}

function saveSettings(next) {
  _settings = {
    supabaseUrl: (next?.supabaseUrl || "").trim(),
    supabaseAnonKey: (next?.supabaseAnonKey || "").trim(),
    activeCompanyId: (next?.activeCompanyId || "").trim(),
  };
  localStorage.setItem(LS_KEY, JSON.stringify(_settings));
  return _settings;
}

// ---------------------------
// MODE
// ---------------------------

function getMode() {
  return _mode;
}

function setMode(nextMode) {
  _mode = nextMode === "supabase" ? "supabase" : "mock";
}

function mustSupabase() {
  if (_mode !== "supabase" || !_supabase) {
    throw new Error("Supabase não inicializado. Configure Supabase URL/Anon Key em Configurações.");
  }
  return _supabase;
}

// ---------------------------
// Supabase init (singleton + fallback de config)
// ---------------------------

let _supabaseSingleton = null;
let _supabaseSingletonUrl = null;
let _supabaseSingletonKey = null;
let _createClientFn = null;

async function _loadConfigFromFiles() {
  // Ordem:
  // 1) config.local.js (dev/local)
  // 2) config.js (opcional, se você decidir commitar config pública)
  // 3) config.example.js (geralmente placeholder)
  const candidates = ["./config.local.js", "./config.js", "./config.example.js"];
  for (const path of candidates) {
    try {
      const mod = await import(path);
      const cfg = mod?.CONFIG || mod?.default || mod;
      const supabaseUrl = String(cfg?.SUPABASE_URL || "").trim();
      const supabaseAnonKey = String(cfg?.SUPABASE_ANON_KEY || "").trim();

      const looksPlaceholder =
        !supabaseUrl ||
        !supabaseAnonKey ||
        supabaseUrl.includes("YOUR_") ||
        supabaseAnonKey.includes("YOUR_") ||
        supabaseUrl.includes("example") ||
        supabaseAnonKey.includes("example");

      if (!looksPlaceholder) return { supabaseUrl, supabaseAnonKey };
    } catch (_) {
      // arquivo pode não existir no GitHub Pages -> ignore
    }
  }
  return null;
}

async function initFromSettings() {
  // 1) carrega do localStorage (cada navegador tem seu storage!)
  const saved = getSavedSettings() || {};
  _settings = {
    supabaseUrl: saved.supabaseUrl || "",
    supabaseAnonKey: saved.supabaseAnonKey || "",
    activeCompanyId: saved.activeCompanyId || "",
  };

  // 2) fallback: se não tiver no storage, tenta ler de config*.js (principalmente no localhost)
  if (!_settings.supabaseUrl || !_settings.supabaseAnonKey) {
    const cfg = await _loadConfigFromFiles();
    if (cfg) {
      _settings.supabaseUrl = cfg.supabaseUrl;
      _settings.supabaseAnonKey = cfg.supabaseAnonKey;
      // Não persistimos automaticamente.
    }
  }

  // 3) se ainda não tiver credenciais, entra em modo mock (não quebra UI)
  if (!_settings.supabaseUrl || !_settings.supabaseAnonKey) {
    setMode("mock");
    _supabase = null;
    _supabaseSingleton = null;
    _supabaseSingletonUrl = null;
    _supabaseSingletonKey = null;
    return false;
  }

  // 4) carrega createClient uma única vez
  if (!_createClientFn) {
    const pkg = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
    _createClientFn = pkg.createClient;
  }

  // 5) singleton do supabase client: evita "Multiple GoTrueClient instances"
  const credsChanged =
    _supabaseSingletonUrl !== _settings.supabaseUrl ||
    _supabaseSingletonKey !== _settings.supabaseAnonKey;

  if (!_supabaseSingleton || credsChanged) {
    _supabaseSingleton = _createClientFn(_settings.supabaseUrl, _settings.supabaseAnonKey);
    _supabaseSingletonUrl = _settings.supabaseUrl;
    _supabaseSingletonKey = _settings.supabaseAnonKey;
  }

  _supabase = _supabaseSingleton;
  setMode("supabase");
  return true;
}

// ---------------------------
// AUTH
// ---------------------------

async function login(email, password) {
  const ok = await initFromSettings();
  if (!ok) throw new Error("Supabase não configurado. Informe Supabase URL e Anon Key em Configurações.");

  const sb = mustSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function logout() {
  if (_mode !== "supabase" || !_supabase) return;
  const sb = mustSupabase();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

// ---------------------------
// MULTI-EMPRESA
// ---------------------------

function getActiveCompanyIdFromStorage() {
  try {
    return (localStorage.getItem("ACTIVE_COMPANY_ID") || "").trim();
  } catch {
    return "";
  }
}

function setActiveCompanyIdToStorage(companyId) {
  try {
    localStorage.setItem("ACTIVE_COMPANY_ID", String(companyId || "").trim());
  } catch {
    // ignore
  }
}

async function getActiveCompanyId() {
  if (_mode !== "supabase") return null;

  // 1) prioridade: storage dedicado
  const stored = getActiveCompanyIdFromStorage();
  if (stored) return stored;

  // 2) depois: settings
  if (_settings?.activeCompanyId) return _settings.activeCompanyId;

  // 3) senão: primeira company disponível para o usuário
  const sb = mustSupabase();

  // Em projetos com RLS, normalmente a tabela já filtra pelo auth.uid()
  const { data, error } = await sb
    .from("company_users")
    .select("company_id")
    .limit(10);

  if (error) throw error;

  const first = data?.[0]?.company_id || null;
  if (first) {
    setActiveCompanyIdToStorage(first);
    _settings.activeCompanyId = first;
    saveSettings(_settings);
  }
  return first;
}

// ---------------------------
// TXS (FINANCEIRO)
// ---------------------------

const txs = {
  async list({ type, monthISO, query } = {}) {
    if (_mode === "mock") {
      return [];
    }

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    let q = sb.from("txs").select("*").eq("company_id", companyId).order("due_date", { ascending: true });

    if (type) q = q.eq("type", type);

    if (monthISO) {
      // monthISO: "2026-02" -> filtra do primeiro ao último dia
      const [y, m] = monthISO.split("-").map((v) => parseInt(v, 10));
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 1));
      q = q.gte("due_date", start.toISOString().slice(0, 10)).lt("due_date", end.toISOString().slice(0, 10));
    }

    if (query) {
      // busca simples por desc/category
      q = q.or(`desc.ilike.%${query}%,category.ilike.%${query}%`);
    }

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return { id: crypto.randomUUID(), ...payload };

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = {
      company_id: companyId,
      type: payload.type,
      desc: payload.desc || payload.description || "",
      amount: Number(payload.amount || 0),
      due_date: payload.due_date || payload.dueDate || null,
      category: payload.category || null,
      status: payload.status || "aberto",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await sb.from("txs").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, patch) {
    if (_mode === "mock") return { id, ...patch };

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = {
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await sb
      .from("txs")
      .update(row)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return true;

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const { error } = await sb.from("txs").delete().eq("id", id).eq("company_id", companyId);
    if (error) throw error;
    return true;
  },
};

// ---------------------------
// STUBS (mantém compatibilidade com app.js)
// ---------------------------

const clients = {};
const quotes = {};
const workorders = {};
const reports = {};

// ---------------------------
// EXPORT
// ---------------------------

export const Data = {
  get mode() {
    return getMode();
  },
  setMode,
  getSavedSettings,
  saveSettings,
  initFromSettings,
  login,
  logout,

  // domínios
  txs,
  clients,
  quotes,
  workorders,
  reports,

  // multi-empresa helpers (se quiser chamar do app)
  getActiveCompanyId,
  setActiveCompanyIdToStorage,
};

export default Data;
