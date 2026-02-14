// data.js (SEM MODULES)
// Camada de dados (Mock + Supabase) — usa window.sb (supabase client) e window.Utils

(function () {
  const U = window.Utils;
  const LS_KEY = "serralheria_settings_v1";

  let _mode = "mock"; // "mock" | "supabase"
  let companyId = null;
  let userId = null;

  const mockDB = {
    session: null,
    active_company_id: "mock-company-1",
    clients: [],
    quotes: [],
    workorders: [],
    txs: [],
  };

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

  function ensureMockSeed() {
    if (mockDB.clients.length) return;

    const c1 = { id: U.uid("cli"), name: "Cliente Exemplo", phone: "(31) 99999-0000", address: "Rua A, 123", notes: "" };
    const c2 = { id: U.uid("cli"), name: "Maria Silva", phone: "(31) 98888-1111", address: "Rua B, 456", notes: "" };
    mockDB.clients.push(c1, c2);

    const m = U.monthISO(new Date());
    mockDB.txs.push(
      { id: U.uid("tx"), company_id: mockDB.active_company_id, type: "receber", desc: "Entrada Orçamento", amount: 500, due_date: `${m}-10`, category: "servicos", status: "quitado", created_at: new Date().toISOString() },
      { id: U.uid("tx"), company_id: mockDB.active_company_id, type: "pagar", desc: "Compra de material", amount: 240, due_date: `${m}-11`, category: "material", status: "quitado", created_at: new Date().toISOString() },
      { id: U.uid("tx"), company_id: mockDB.active_company_id, type: "receber", desc: "Saldo a receber", amount: 3000, due_date: `${m}-20`, category: "servicos", status: "aberto", created_at: new Date().toISOString() }
    );
  }

  // ✅ CORREÇÃO: calcula o range do mês corretamente (último dia real)
  function monthRange(monthStr) {
    // monthStr: "YYYY-MM"
    if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return null;
    const [yy, mm] = monthStr.split("-").map(Number);
    const start = `${monthStr}-01`;

    // Último dia do mês: dia 0 do próximo mês
    const lastDay = new Date(yy, mm, 0).getDate(); // mm aqui é 1..12
    const end = `${monthStr}-${String(lastDay).padStart(2, "0")}`;

    return { start, end };
  }

  async function initFromSettings() {
    const s = getSavedSettings();

    // Prioridade: settings do usuário; se vazio, cai pro CONFIG
    const cfg = window.CONFIG || {};
    const url = s.supabaseUrl || cfg.SUPABASE_URL || "";
    const key = s.supabaseKey || cfg.SUPABASE_KEY || "";
    const forcedDefaultCompany = s.defaultCompanyId || cfg.DEFAULT_COMPANY_ID || null;

    // modo
    const desiredMode = s.mode || "supabase";
    setMode(desiredMode);

    // se supabase não estiver pronto, cai pra mock
    if (_mode === "supabase") {
      if (!window.sb) {
        console.warn("[Data.initFromSettings] supabase client indisponível -> fallback mock");
        setMode("mock");
        ensureMockSeed();
        return { mode: _mode };
      }
      // guarda defaults úteis
      if (url) s.supabaseUrl = url;
      if (key) s.supabaseKey = key;
      if (forcedDefaultCompany) s.defaultCompanyId = forcedDefaultCompany;
      s.mode = "supabase";
      saveSettings(s);
      return { mode: _mode };
    }

    ensureMockSeed();
    return { mode: _mode };
  }

  async function init() {
    // 1) garantir modo e client
    await initFromSettings();

    // 2) se supabase, resolver sessão e companyId
    if (_mode === "supabase" && window.sb) {
      const sb = window.sb;

      const { data: ses, error: sesErr } = await sb.auth.getSession();
      if (sesErr) console.warn("[Data.init] getSession error", sesErr);

      userId = ses?.session?.user?.id || null;

      // se não tiver sessão, não dá pra puxar company_users via RLS
      if (!userId) {
        companyId = null;
        return { ok: true, mode: _mode, hasSession: false, userId: null, companyId: null };
      }

      const { data: cu, error: cuErr } = await sb
        .from("company_users")
        .select("company_id, role, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (cuErr) console.warn("[Data.init] company_users error", cuErr);

      // tenta resolver companyId pela tabela company_users
      companyId = cu?.[0]?.company_id || null;

      // fallback 1: RPC helper (se existir no banco)
      if (!companyId) {
        try {
          const { data: rpcCid, error: rpcErr } = await sb.rpc("current_company_id");
          if (rpcErr) {
            console.warn("[Data.init] rpc current_company_id error", rpcErr);
          } else {
            companyId = rpcCid || null;
          }
        } catch (e) {
          console.warn("[Data.init] rpc current_company_id exception", e);
        }
      }

      // fallback 2: DEFAULT_COMPANY_ID do config
      if (!companyId) {
        companyId = window.CONFIG?.DEFAULT_COMPANY_ID || null;
      }

      return { ok: true, mode: _mode, hasSession: true, userId, companyId };
    }

    // mock
    ensureMockSeed();
    companyId = mockDB.active_company_id;
    userId = "mock-user";
    return { ok: true, mode: _mode, hasSession: true, userId, companyId };
  }

  // ---------------------------
  // AUTH
  // ---------------------------
  async function login(email, password) {
    if (_mode !== "supabase") {
      mockDB.session = { email };
      return true;
    }
    const sb = window.sb;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await init(); // atualiza userId/companyId após login
    return true;
  }

  async function logout() {
    if (_mode !== "supabase") {
      mockDB.session = null;
      return true;
    }
    const sb = window.sb;
    await sb.auth.signOut();
    userId = null;
    companyId = null;
    return true;
  }

  function getMode() {
    return _mode;
  }

  function getCompanyId() {
    return companyId;
  }

  function getUserId() {
    return userId;
  }

  function requireCompany() {
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");
    return companyId;
  }

  // ---------------------------
  // FINANCEIRO (txs)
  // ---------------------------
  async function listTxs({ type = null, month = null } = {}) {
    if (_mode !== "supabase") {
      ensureMockSeed();
      let rows = [...mockDB.txs];
      if (type) rows = rows.filter((t) => t.type === type);
      if (month) rows = rows.filter((t) => String(t.due_date || "").startsWith(month));
      rows.sort((a, b) => String(b.due_date).localeCompare(String(a.due_date)));
      return rows;
    }

    const sb = window.sb;
    const cid = requireCompany();

    let q = sb
      .from("txs")
      .select("id, company_id, type, desc, amount, due_date, category, status, created_at, updated_at")
      .eq("company_id", cid)
      .order("due_date", { ascending: false });

    if (type) q = q.eq("type", type);

    if (month) {
      const r = monthRange(month);
      if (r) {
        q = q.gte("due_date", r.start).lte("due_date", r.end);
      }
    }

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function createTx(payload) {
    if (_mode !== "supabase") {
      ensureMockSeed();
      const row = {
        id: U.uid("tx"),
        company_id: mockDB.active_company_id,
        type: payload.type,
        desc: payload.desc,
        amount: Number(payload.amount),
        due_date: payload.due_date || U.todayISO(),
        category: payload.category || null,
        status: payload.status || "aberto",
        created_at: new Date().toISOString(),
      };
      mockDB.txs.unshift(row);
      return row;
    }

    const sb = window.sb;
    const cid = requireCompany();

    const row = {
      company_id: cid,
      type: payload.type,
      desc: payload.desc,
      amount: Number(payload.amount),
      due_date: payload.due_date || U.todayISO(),
      category: payload.category || null,
      status: payload.status || "aberto",
    };

    const { data, error } = await sb.from("txs").insert(row).select("*").single();
    if (error) throw error;
    return data;
  }

  async function deleteTx(id) {
    if (_mode !== "supabase") {
      mockDB.txs = mockDB.txs.filter((t) => t.id !== id);
      return true;
    }
    const sb = window.sb;
    const cid = requireCompany();
    const { error } = await sb.from("txs").delete().eq("id", id).eq("company_id", cid);
    if (error) throw error;
    return true;
  }

  // ---------------------------
  // CLIENTES (customers)
  // ---------------------------
  async function listClients({ search = "" } = {}) {
    if (_mode !== "supabase") {
      ensureMockSeed();
      let rows = [...mockDB.clients];
      if (search) {
        const s = search.toLowerCase();
        rows = rows.filter((c) => (c.name || "").toLowerCase().includes(s) || (c.phone || "").toLowerCase().includes(s));
      }
      return rows;
    }

    const sb = window.sb;
    const cid = requireCompany();

    const { data, error } = await sb
      .from("customers")
      .select("id, company_id, name, phone, address, notes, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (search && search.trim().length >= 2) {
      const s = search.toLowerCase();
      return (data || []).filter((c) => (c.name || "").toLowerCase().includes(s) || (c.phone || "").toLowerCase().includes(s));
    }

    return data || [];
  }

  async function upsertClient(payload) {
    if (_mode !== "supabase") {
      ensureMockSeed();
      if (payload.id) {
        const i = mockDB.clients.findIndex((c) => c.id === payload.id);
        if (i >= 0) mockDB.clients[i] = { ...mockDB.clients[i], ...payload };
        return mockDB.clients[i];
      }
      const row = { id: U.uid("cli"), ...payload };
      mockDB.clients.unshift(row);
      return row;
    }

    const sb = window.sb;
    const cid = requireCompany();

    const row = {
      id: payload.id || undefined,
      company_id: cid,
      name: String(payload.name || "").trim(),
      phone: payload.phone ? String(payload.phone).trim() : null,
      address: payload.address ? String(payload.address).trim() : null,
      notes: payload.notes ? String(payload.notes).trim() : null,
    };

    const { data, error } = await sb.from("customers").upsert(row).select("*").single();
    if (error) throw error;
    return data;
  }

  async function deleteClient(id) {
    if (_mode !== "supabase") {
      mockDB.clients = mockDB.clients.filter((c) => c.id !== id);
      return true;
    }
    const sb = window.sb;
    const cid = requireCompany();
    const { error } = await sb.from("customers").delete().eq("id", id).eq("company_id", cid);
    if (error) throw error;
    return true;
  }

  // expõe API
  window.Data = {
    // init
    initFromSettings,
    init,
    // auth
    login,
    logout,
    // state
    getMode,
    getCompanyId,
    getUserId,
    // debug/state
    companyId,
    userId,
    // txs
    listTxs,
    createTx,
    deleteTx,
    // clients
    listClients,
    upsertClient,
    deleteClient,
  };

  console.log("[Data] carregado (sem modules)");
})();
