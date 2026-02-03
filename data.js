/* data.js — Serralheria | Data Layer (Supabase + Multi-empresa + Financeiro)
   Regras:
   - Um único Supabase client (singleton) por URL/KEY (evita Multiple GoTrueClient)
   - company ativa vem de:
     (1) localStorage last_company_id
     (2) primeiro registro de company_users
   - Financeiro insere em txs (TABLE). Lista tenta txs e cai pra txs_view se necessário.
*/

export const VERSION = "2026-02-02B";

/* ----------------------------- Storage keys ----------------------------- */
const LS_SETTINGS = "sv_settings";
const LS_LAST_COMPANY_ID = "sv_last_company_id";

/* ----------------------------- Internal state --------------------------- */
let MODE = "supabase"; // "supabase" | "mock"
let _sb = null;        // supabase client singleton
let _sbSig = null;     // signature: url|key
let _activeCompanyId = null;

/* ------------------------------ Utils ---------------------------------- */
function nowIso() { return new Date().toISOString(); }

function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function normStr(x) {
  return (x ?? "").toString().trim();
}

function isUuid(v) {
  const s = normStr(v);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function errMsg(e) {
  return e?.message || e?.error_description || e?.error || String(e);
}

/* ----------------------------- Settings -------------------------------- */
function getSavedSettings() {
  const s = readJSON(LS_SETTINGS, {}) || {};
  return {
    mode: s.mode || "supabase",
    supabaseUrl: s.supabaseUrl || "",
    supabaseKey: s.supabaseKey || ""
  };
}

function saveSettings(settings) {
  const cur = getSavedSettings();
  const next = {
    ...cur,
    ...settings,
  };
  writeJSON(LS_SETTINGS, next);
  return next;
}

function setMode(mode) {
  MODE = (mode === "mock") ? "mock" : "supabase";
}

/* -------------------------- Supabase singleton -------------------------- */
async function createSupabaseClient(url, key) {
  // Sempre usa a mesma lib oficial, versão fixa para estabilidade
  const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const { createClient } = mod;

  // storageKey fixo para o app inteiro (evita duplicação por abas com keys diferentes)
  const storageKey = "sv_auth";

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey,
    }
  });
}

async function ensureSupabase() {
  const s = getSavedSettings();

  if ((s.mode || "supabase") === "mock") {
    MODE = "mock";
    return null;
  }

  MODE = "supabase";

  const url = normStr(s.supabaseUrl);
  const key = normStr(s.supabaseKey);

  if (!url || !key) {
    throw new Error("Supabase não configurado. Informe Supabase URL e Anon Key em Configurações.");
  }

  const sig = `${url}|${key}`;
  if (_sb && _sbSig === sig) return _sb;

  // Se já existia outro client (outra key/url), descarta e cria novo.
  _sb = await createSupabaseClient(url, key);
  _sbSig = sig;
  return _sb;
}

/* --------------------------- Auth helpers ------------------------------- */
async function getSession() {
  if (MODE === "mock") return { user: { id: "mock-user" } };

  const sb = await ensureSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) throw new Error(`Auth getSession: ${errMsg(error)}`);
  return data?.session || null;
}

async function getUserId() {
  if (MODE === "mock") return "mock-user";
  const session = await getSession();
  const uid = session?.user?.id;
  if (!uid) throw new Error("Sem sessão ativa (user_id não encontrado).");
  return uid;
}

/* ------------------------- Multi-empresa -------------------------------- */
function getLastCompanyId() {
  const v = localStorage.getItem(LS_LAST_COMPANY_ID);
  return isUuid(v) ? v : null;
}

function setLastCompanyId(companyId) {
  if (isUuid(companyId)) {
    localStorage.setItem(LS_LAST_COMPANY_ID, companyId);
  }
}

async function listUserCompanies() {
  if (MODE === "mock") {
    return [{ company_id: "mock-company", role: "owner" }];
  }

  const sb = await ensureSupabase();

  // RLS: policy deve permitir select onde user_id = auth.uid()
  const { data, error } = await sb
    .from("company_users")
    .select("company_id, role, created_at")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`company_users select: ${errMsg(error)}`);
  return data || [];
}

async function ensureActiveCompanyId() {
  if (MODE === "mock") {
    _activeCompanyId = "mock-company";
    return _activeCompanyId;
  }

  // 1) memória
  if (isUuid(_activeCompanyId)) return _activeCompanyId;

  // 2) localStorage
  const last = getLastCompanyId();
  if (isUuid(last)) {
    _activeCompanyId = last;
    return _activeCompanyId;
  }

  // 3) banco (company_users)
  const rows = await listUserCompanies();
  const first = rows?.[0]?.company_id;
  if (isUuid(first)) {
    _activeCompanyId = first;
    setLastCompanyId(first);
    return _activeCompanyId;
  }

  // Se chegou aqui, não tem vínculo com empresa
  throw new Error("Não foi possível determinar a company ativa (company_users vazio para este usuário).");
}

async function setActiveCompanyId(companyId) {
  if (!isUuid(companyId)) throw new Error("company_id inválido.");
  _activeCompanyId = companyId;
  setLastCompanyId(companyId);
  return _activeCompanyId;
}

function getActiveCompanyIdCached() {
  return isUuid(_activeCompanyId) ? _activeCompanyId : getLastCompanyId();
}

/* --------------------------- Financeiro --------------------------------- */
/*
  Esperado em public.txs (TABLE):
  - id uuid default gen_random_uuid()
  - company_id uuid
  - type text ('receber'|'pagar'|'caixa' etc)
  - desc text
  - amount numeric
  - due_date date
  - category text nullable
  - status text ('aberto'|'quitado')
  - created_at timestamptz default now()
  - updated_at timestamptz default now()

  E pode existir public.txs_view para leitura.
*/

async function listTxs({ monthIso } = {}) {
  if (MODE === "mock") return [];

  const sb = await ensureSupabase();
  const companyId = await ensureActiveCompanyId();

  // filtro por mês (YYYY-MM) opcional
  const month = normStr(monthIso); // "2026-02"
  let fromDate = null;
  let toDate = null;
  if (/^\d{4}-\d{2}$/.test(month)) {
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    fromDate = start.toISOString().slice(0, 10);
    toDate = end.toISOString().slice(0, 10);
  }

  // 1) tenta TABLE txs
  try {
    let q = sb.from("txs").select("*").eq("company_id", companyId).order("due_date", { ascending: true });
    if (fromDate && toDate) q = q.gte("due_date", fromDate).lt("due_date", toDate);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (e) {
    // 2) fallback: VIEW txs_view (não tem company_id no seu definition original; mas você pode ter ajustado)
    // Se não tiver company_id na view, vai listar tudo — melhor do que “tela vazia”.
    let qv = sb.from("txs_view").select("*").order("due_date", { ascending: true });
    if (fromDate && toDate) qv = qv.gte("due_date", fromDate).lt("due_date", toDate);

    const { data, error } = await qv;
    if (error) throw new Error(`txs list falhou (txs e txs_view): ${errMsg(error)}`);
    return data || [];
  }
}

async function createTx(payload) {
  if (MODE === "mock") return { ok: true };

  const sb = await ensureSupabase();
  const companyId = await ensureActiveCompanyId();

  const type = normStr(payload?.type);
  const desc = normStr(payload?.desc);
  const amount = Number(payload?.amount ?? 0);
  const due_date = normStr(payload?.due_date);
  const category = payload?.category ? normStr(payload.category) : null;
  const status = normStr(payload?.status) || "aberto";

  if (!type) throw new Error("Tipo é obrigatório.");
  if (!desc) throw new Error("Descrição é obrigatória.");
  if (!Number.isFinite(amount)) throw new Error("Valor inválido.");
  if (!due_date) throw new Error("Vencimento é obrigatório.");

  const row = {
    company_id: companyId,
    type,
    desc,
    amount,
    due_date,
    category,
    status,
    // updated_at pode não existir em algumas tabelas; não seto aqui
  };

  const { data, error } = await sb.from("txs").insert(row).select("id").single();
  if (error) throw new Error(`Insert txs: ${errMsg(error)}`);
  return { ok: true, id: data?.id || null };
}

async function updateTx(id, patch) {
  if (MODE === "mock") return { ok: true };

  const sb = await ensureSupabase();
  await ensureActiveCompanyId();

  if (!isUuid(id)) throw new Error("ID inválido.");

  const upd = { ...patch };
  // se existir updated_at na tabela, o trigger pode cuidar; não forço.
  const { error } = await sb.from("txs").update(upd).eq("id", id);
  if (error) throw new Error(`Update txs: ${errMsg(error)}`);
  return { ok: true };
}

async function deleteTx(id) {
  if (MODE === "mock") return { ok: true };

  const sb = await ensureSupabase();
  await ensureActiveCompanyId();

  if (!isUuid(id)) throw new Error("ID inválido.");

  const { error } = await sb.from("txs").delete().eq("id", id);
  if (error) throw new Error(`Delete txs: ${errMsg(error)}`);
  return { ok: true };
}

/* ------------------------------ Auth API -------------------------------- */
async function initFromSettings() {
  // chamada segura: se já existe e assinatura igual, não recria
  const s = getSavedSettings();
  setMode(s.mode);

  if (MODE === "mock") return { mode: "mock", ready: true };

  await ensureSupabase();
  // apenas valida sessão (não obriga login)
  try { await getSession(); } catch { /* ignore */ }

  // tenta company
  try { await ensureActiveCompanyId(); } catch { /* ignore */ }

  return { mode: "supabase", ready: true };
}

async function login(email, password) {
  if (MODE === "mock") return true;

  const sb = await ensureSupabase();
  const e = normStr(email);
  const p = password || "";

  const { error } = await sb.auth.signInWithPassword({ email: e, password: p });
  if (error) throw new Error(`Login: ${errMsg(error)}`);

  // garante company ativa após login
  await ensureActiveCompanyId();
  return true;
}

async function logout() {
  if (MODE === "mock") return true;
  const sb = await ensureSupabase();
  await sb.auth.signOut();
  _activeCompanyId = null;
  return true;
}

/* ------------------------------ Public ---------------------------------- */
export const Data = {
  // meta
  VERSION,

  // settings
  getSavedSettings,
  saveSettings,
  setMode,
  initFromSettings,

  // auth
  login,
  logout,
  getSession,

  // company
  listUserCompanies,
  ensureActiveCompanyId,
  setActiveCompanyId,
  getActiveCompanyIdCached,

  // financeiro
  listTxs,
  createTx,
  updateTx,
  deleteTx,

  // debug
  _debug: {
    get mode() { return MODE; },
    get sig() { return _sbSig; },
    get activeCompanyId() { return _activeCompanyId; },
    resetClient() { _sb = null; _sbSig = null; _activeCompanyId = null; }
  }
};
