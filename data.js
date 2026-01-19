import { createClientIfConfigured } from "./supabaseClient.js";
import { uid } from "./utils.js";

/**
 * Data Layer
 * - mode "mock": salva em localStorage (funciona offline)
 * - mode "supabase": usa Supabase (precisa URL/KEY + tabelas)
 */

const LS_KEY = "serralheria_settings_v1";
const LS_DB  = "serralheria_mock_db_v1";

let _mode = "mock";
let _sb = null;

function loadMockDB(){
  const raw = localStorage.getItem(LS_DB);
  if(raw) return JSON.parse(raw);

  const seed = {
    clients: [
      { id: uid(), name:"Cliente Demonstração", phone:"(00) 90000-0000", address:"", notes:"" },
    ],
    quotes: [
      { id: uid(), client_id:null, desc:"Portão 3,0 x 2,2 (exemplo)", total: 2500, status:"aberto", deadline_days: 10 },
    ],
    workorders: [],
    txs: [
      { id: uid(), type:"receber", desc:"Entrada OS (exemplo)", amount: 800, due_date: new Date().toISOString().slice(0,10), category:null, status:"aberto" },
      { id: uid(), type:"pagar", desc:"Compra material (exemplo)", amount: 320, due_date: new Date().toISOString().slice(0,10), category:"material", status:"aberto" },
    ],
  };
  localStorage.setItem(LS_DB, JSON.stringify(seed));
  return seed;
}
function saveMockDB(db){
  localStorage.setItem(LS_DB, JSON.stringify(db));
}

function getSettings(){
  const raw = localStorage.getItem(LS_KEY);
  if(!raw) return { mode:"mock", supabaseUrl:"", supabaseKey:"" };
  try{ return JSON.parse(raw); }catch{ return { mode:"mock", supabaseUrl:"", supabaseKey:"" }; }
}

function saveSettings(s){
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

async function initFromSettings(){
  const s = getSettings();
  _mode = s.mode || "mock";

  if(_mode === "supabase"){
    _sb = createClientIfConfigured(s.supabaseUrl, s.supabaseKey);
    if(!_sb){
      _mode = "mock";
      _sb = null;
    }
  }else{
    _sb = null;
  }
}

function setMode(mode){
  _mode = mode;
  if(mode !== "supabase") _sb = null;
}

function mode(){ return _mode; }
function getSavedSettings(){ return getSettings(); }

async function login(email, password){
  if(_mode !== "supabase") return true;
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if(error) throw error;
  return !!data?.session;
}

async function logout(){
  if(_mode !== "supabase") return true;
  await _sb.auth.signOut();
  return true;
}

// ---------- CRUD helpers ----------
function mockList(key){
  const db = loadMockDB();
  return [...(db[key] || [])];
}
function mockCreate(key, payload){
  const db = loadMockDB();
  const item = { id: uid(), ...payload };
  db[key].push(item);
  saveMockDB(db);
  return item;
}
function mockUpdate(key, id, payload){
  const db = loadMockDB();
  const idx = db[key].findIndex(x => x.id === id);
  if(idx < 0) throw new Error("Item não encontrado.");
  db[key][idx] = { ...db[key][idx], ...payload };
  saveMockDB(db);
  return db[key][idx];
}
function mockRemove(key, id){
  const db = loadMockDB();
  db[key] = (db[key] || []).filter(x => x.id !== id);
  saveMockDB(db);
}

async function sbList(table){
  const { data, error } = await _sb.from(table).select("*").order("created_at", { ascending:false });
  if(error) throw error;
  return data || [];
}
async function sbCreate(table, payload){
  const { data, error } = await _sb.from(table).insert(payload).select("*").single();
  if(error) throw error;
  return data;
}
async function sbUpdate(table, id, payload){
  const { data, error } = await _sb.from(table).update(payload).eq("id", id).select("*").single();
  if(error) throw error;
  return data;
}
async function sbRemove(table, id){
  const { error } = await _sb.from(table).delete().eq("id", id);
  if(error) throw error;
}

// ---------- Public API ----------
const clients = {
  async list(){
    if(_mode === "supabase") return sbList("clients");
    return mockList("clients");
  },
  async create(payload){
    if(_mode === "supabase") return sbCreate("clients", payload);
    return mockCreate("clients", payload);
  },
  async update(id, payload){
    if(_mode === "supabase") return sbUpdate("clients", id, payload);
    return mockUpdate("clients", id, payload);
  },
  async remove(id){
    if(_mode === "supabase") return sbRemove("clients", id);
    return mockRemove("clients", id);
  }
};

const quotes = {
  async list(){
    if(_mode === "supabase") return sbList("quotes");
    return mockList("quotes");
  },
  async create(payload){
    if(_mode === "supabase") return sbCreate("quotes", payload);
    return mockCreate("quotes", payload);
  },
  async update(id, payload){
    if(_mode === "supabase") return sbUpdate("quotes", id, payload);
    return mockUpdate("quotes", id, payload);
  },
  async remove(id){
    if(_mode === "supabase") return sbRemove("quotes", id);
    return mockRemove("quotes", id);
  }
};

const workorders = {
  async list(){
    if(_mode === "supabase") return sbList("workorders");
    return mockList("workorders");
  },
  async create(payload){
    if(_mode === "supabase") return sbCreate("workorders", payload);
    return mockCreate("workorders", payload);
  },
  async update(id, payload){
    if(_mode === "supabase") return sbUpdate("workorders", id, payload);
    return mockUpdate("workorders", id, payload);
  },
  async remove(id){
    if(_mode === "supabase") return sbRemove("workorders", id);
    return mockRemove("workorders", id);
  }
};

const txs = {
  async list(){
    if(_mode === "supabase") return sbList("transactions");
    return mockList("txs");
  },
  async create(payload){
    if(_mode === "supabase") return sbCreate("transactions", payload);
    return mockCreate("txs", payload);
  },
  async update(id, payload){
    if(_mode === "supabase") return sbUpdate("transactions", id, payload);
    return mockUpdate("txs", id, payload);
  },
  async remove(id){
    if(_mode === "supabase") return sbRemove("transactions", id);
    return mockRemove("txs", id);
  }
};

const reports = {
  async monthSummary(yyyyMm){
    const tx = await txs.list();
    const monthTx = tx.filter(t => (t.due_date || "").startsWith(yyyyMm));
    const paid = monthTx.filter(t => t.status === "quitado");
    const open = monthTx.filter(t => t.status !== "quitado");

    const inPaid  = paid.filter(t=>t.type==="receber").reduce((a,b)=>a+(Number(b.amount)||0),0);
    const outPaid = paid.filter(t=>t.type==="pagar").reduce((a,b)=>a+(Number(b.amount)||0),0);

    const inOpen  = open.filter(t=>t.type==="receber").reduce((a,b)=>a+(Number(b.amount)||0),0);
    const outOpen = open.filter(t=>t.type==="pagar").reduce((a,b)=>a+(Number(b.amount)||0),0);

    const text =
`MÊS: ${yyyyMm}
- Entradas quitadas: R$ ${inPaid.toFixed(2)}
- Saídas quitadas:   R$ ${outPaid.toFixed(2)}
- Saldo (quitado):   R$ ${(inPaid - outPaid).toFixed(2)}

PENDENTE NO MÊS
- A receber:         R$ ${inOpen.toFixed(2)}
- A pagar:           R$ ${outOpen.toFixed(2)}
`;

    const whatsappText =
`Resumo Financeiro (${yyyyMm})
Entradas quitadas: R$ ${inPaid.toFixed(2)}
Saídas quitadas:   R$ ${outPaid.toFixed(2)}
Saldo:             R$ ${(inPaid - outPaid).toFixed(2)}

Pendente:
A receber:         R$ ${inOpen.toFixed(2)}
A pagar:           R$ ${outOpen.toFixed(2)}
`;

    return { text, whatsappText };
  }
};

export const Data = {
  initFromSettings,
  setMode,
  mode,
  getSavedSettings,
  saveSettings,
  login,
  logout,
  clients,
  quotes,
  workorders,
  txs,
  reports,
};
