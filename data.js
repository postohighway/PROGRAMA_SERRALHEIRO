const STORAGE_KEY = "app_settings";

let _mode = "mock";
let _supabase = null;

function getSavedSettings(){
  try{
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  }catch{
    return {};
  }
}

function saveSettings(s){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

async function initFromSettings(){
  const s = getSavedSettings();
  _mode = s.mode || "mock";

  if(_mode === "supabase"){
    if(!s.supabaseUrl || !s.supabaseKey){
      throw new Error("Supabase não configurado.");
    }

    if(!window.supabase){
      throw new Error("SDK Supabase não carregado.");
    }

    _supabase = window.supabase.createClient(
      s.supabaseUrl,
      s.supabaseKey
    );
  } else {
    _supabase = null;
  }
}

function mode(){
  return _mode;
}

async function login(){
  return true;
}

async function logout(){
  return true;
}

/* =======================
   MOCK STORAGE
======================= */

function mockTable(name){
  const key = `mock_${name}`;
  return {
    list(){
      return JSON.parse(localStorage.getItem(key) || "[]");
    },
    save(rows){
      localStorage.setItem(key, JSON.stringify(rows));
    }
  };
}

function createCrud(table){
  const t = mockTable(table);

  return {
    async list(){
      if(_mode === "mock") return t.list();
      const { data, error } = await _supabase.from(table).select("*");
      if(error) throw error;
      return data || [];
    },

    async create(payload){
      if(_mode === "mock"){
        const rows = t.list();
        payload.id = crypto.randomUUID();
        rows.push(payload);
        t.save(rows);
        return payload;
      }
      const { data, error } = await _supabase.from(table).insert(payload).select().single();
      if(error) throw error;
      return data;
    },

    async update(id, payload){
      if(_mode === "mock"){
        const rows = t.list();
        const i = rows.findIndex(r=> r.id === id);
        if(i>=0){
          rows[i] = {...rows[i], ...payload};
          t.save(rows);
        }
        return;
      }
      const { error } = await _supabase.from(table).update(payload).eq("id", id);
      if(error) throw error;
    },

    async remove(id){
      if(_mode === "mock"){
        const rows = t.list().filter(r=> r.id !== id);
        t.save(rows);
        return;
      }
      const { error } = await _supabase.from(table).delete().eq("id", id);
      if(error) throw error;
    }
  };
}

/* =======================
   EXPORT
======================= */

export const Data = {
  initFromSettings,
  getSavedSettings,
  saveSettings,
  mode,
  login,
  logout,

  clients: createCrud("clients"),
  quotes: createCrud("quotes"),
  workorders: createCrud("workorders"),
  txs: createCrud("txs"),
};
