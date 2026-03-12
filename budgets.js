
(function () {
  "use strict";
  function $(s,r){return (r||document).querySelector(s);}
  function $all(s,r){return Array.from((r||document).querySelectorAll(s));}
  function esc(t){return String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
  function money(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));}
  function num(v){const n=Number(String(v||"").replace(",", ".")); return Number.isFinite(n)?n:0;}
  function dt(v){if(!v)return "—"; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString("pt-BR");}
  function css(){ if(document.getElementById("css-budgets-v1")) return; const st=document.createElement("style"); st.id="css-budgets-v1"; st.textContent=`
    .budget-items-table{width:100%;border-collapse:collapse;margin-top:10px}.budget-items-table th,.budget-items-table td{padding:10px;border-bottom:1px solid rgba(108,152,232,.12)}.budget-items-table th{font-size:12px;color:#9db3d6;text-align:left}
    .budget-total-box{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:14px;padding:14px;border:1px solid rgba(108,152,232,.14);border-radius:12px;background:rgba(255,255,255,.03)}
    .budget-top-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.budget-mini-list{display:flex;flex-direction:column;gap:10px}.budget-mini-card{padding:12px;border:1px solid rgba(108,152,232,.14);border-radius:12px;background:rgba(255,255,255,.02)}.budget-mini-top{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px}.budget-small{font-size:12px;color:#9db3d6}
  `; document.head.appendChild(st);}
  function statusLabel(s){const m={draft:"Rascunho",sent:"Enviado",approved:"Aprovado",rejected:"Recusado",converted:"Convertido"}; return m[String(s||"").toLowerCase()]||(s||"—");}
  function badge(s){return `<span class="status-pill">${esc(statusLabel(s))}</span>`;}
  async function ensurePipeline(ctx,ticket){
    const ex=await ctx.sb.db.from("commercial_pipeline").select("id,stage").eq("company_id",ctx.companyId).eq("ticket_id",ticket.id).maybeSingle();
    if(ex.error) throw ex.error;
    if(ex.data) return ex.data;
    const ins=await ctx.sb.db.from("commercial_pipeline").insert({company_id:ctx.companyId,ticket_id:ticket.id,stage:"orcamento",estimated_value:0,status:"ativo"}).select("id,stage").single();
    if(ins.error) throw ins.error;
    return ins.data;
  }
  async function loadBudgets(ctx,ticketId){
    const r=await ctx.sb.db.from("budgets").select("id,company_id,ticket_id,pipeline_id,customer_id,client_name,client_phone,description,subtotal,discount_value,total,status,version,created_at,updated_at,approved_at").eq("company_id",ctx.companyId).eq("ticket_id",ticketId).order("created_at",{ascending:false});
    if(r.error) throw r.error; return r.data||[];
  }
  async function loadItems(ctx,budgetId){
    const r=await ctx.sb.db.from("budget_items").select("id,item_type,description,quantity,unit_price,total_price,sort_order").eq("company_id",ctx.companyId).eq("budget_id",budgetId).order("sort_order",{ascending:true});
    if(r.error) throw r.error; return r.data||[];
  }
  async function saveBudget(ctx,payload,items){
    let budgetId=payload.id||null;
    const body={company_id:ctx.companyId,ticket_id:payload.ticket_id,pipeline_id:payload.pipeline_id,customer_id:payload.customer_id||null,client_name:payload.client_name||null,client_phone:payload.client_phone||null,description:payload.description||null,subtotal:payload.subtotal||0,discount_value:payload.discount_value||0,total:payload.total||0,status:payload.status||"draft",version:payload.version||1};
    if(budgetId){
      const u=await ctx.sb.db.from("budgets").update({...body,updated_at:new Date().toISOString()}).eq("id",budgetId).eq("company_id",ctx.companyId).select("id").single();
      if(u.error) throw u.error;
    } else {
      const i=await ctx.sb.db.from("budgets").insert(body).select("id").single();
      if(i.error) throw i.error; budgetId=i.data.id;
    }
    const d=await ctx.sb.db.from("budget_items").delete().eq("company_id",ctx.companyId).eq("budget_id",budgetId); if(d.error) throw d.error;
    if(items.length){
      const rows=items.map((x,idx)=>({company_id:ctx.companyId,budget_id:budgetId,item_type:x.item_type,description:x.description,quantity:x.quantity,unit_price:x.unit_price,total_price:x.total_price,sort_order:idx+1}));
      const ii=await ctx.sb.db.from("budget_items").insert(rows); if(ii.error) throw ii.error;
    }
    const stage=payload.status==="approved"?"aprovado":payload.status==="rejected"?"perdido":payload.status==="sent"?"aprovacao":"orcamento";
    const up=await ctx.sb.db.from("commercial_pipeline").update({stage:stage,estimated_value:payload.total||0,approved_value:payload.status==="approved"?(payload.total||0):null,updated_at:new Date().toISOString()}).eq("company_id",ctx.companyId).eq("id",payload.pipeline_id);
    if(up.error) throw up.error;
    return budgetId;
  }
  async function convertToOs(ctx,budget,ticket){
    const ex=await ctx.sb.db.from("service_orders").select("id,status").eq("company_id",ctx.companyId).eq("budget_id",budget.id).maybeSingle();
    if(ex.error) throw ex.error;
    if(ex.data) return ex.data.id;
    const ins=await ctx.sb.db.from("service_orders").insert({company_id:ctx.companyId,ticket_id:ticket.id,budget_id:budget.id,pipeline_id:budget.pipeline_id||null,status:"pending",notes:"OS criada a partir de orçamento aprovado."}).select("id").single();
    if(ins.error) throw ins.error;
    await ctx.sb.db.from("budgets").update({status:"converted",updated_at:new Date().toISOString()}).eq("id",budget.id).eq("company_id",ctx.companyId);
    if(budget.pipeline_id) await ctx.sb.db.from("commercial_pipeline").update({stage:"execucao",updated_at:new Date().toISOString()}).eq("id",budget.pipeline_id).eq("company_id",ctx.companyId);
    return ins.data.id;
  }
  function renderBudgetsResumoHtml(budgets){
    if(!budgets||!budgets.length) return `<div class="empty">Nenhum orçamento gerado para este chamado.</div>`;
    return budgets.map(b=>`<div class="mini-card"><div class="mini-card-top"><div><div class="mini-card-title">Orçamento v${esc(b.version||1)}</div><div class="budget-small">${esc(dt(b.created_at))}</div></div><div>${badge(b.status)}</div></div><div class="budget-small">Total: ${money(b.total||0)}</div></div>`).join("");
  }
  function abrirModalOrcamento(ctx,ticket,refresh){
    css();
    const back=document.createElement("div"); back.className="modal-backdrop";
    back.innerHTML=`<div class="modal" style="width:min(1180px, calc(100vw - 32px));"><div class="modal-head"><div><div class="modal-title">Orçamento do Chamado</div><div class="panel-sub">${esc(ticket.client_name||"Sem nome")} — ${esc(ticket.description||"")}</div></div><button class="btn btn-ghost" id="fecharBudget">Fechar</button></div><div class="alert error" id="budgetErro"></div><div class="grid-2"><div><div class="grid-form"><div><label class="label">Cliente</label><input id="budgetClientName" class="field"></div><div><label class="label">Telefone</label><input id="budgetClientPhone" class="field"></div><div class="full"><label class="label">Descrição geral</label><textarea id="budgetDescription" class="textarea"></textarea></div></div><div class="budget-top-actions"><button class="btn btn-secondary" id="addServico">+ Serviço</button><button class="btn btn-secondary" id="addProduto">+ Produto</button><button class="btn btn-secondary" id="novoRascunho">Novo rascunho</button></div><div id="itemsWrap"></div><div class="budget-total-box"><div>Subtotal</div><div id="budgetSubtotal">R$ 0,00</div><div>Desconto</div><div><input id="budgetDiscount" class="field" type="number" step="0.01" value="0"></div><div><strong>Total</strong></div><div><strong id="budgetTotal">R$ 0,00</strong></div></div><div class="modal-actions" style="margin-top:14px;"><button class="btn btn-secondary" id="saveDraft">Salvar rascunho</button><button class="btn btn-primary" id="markSent">Marcar como enviado</button><button class="btn btn-success" id="markApproved">Aprovar</button><button class="btn btn-warning" id="convertOs">Converter em OS</button><button class="btn btn-ghost" id="markRejected">Rejeitar</button></div></div><div><h3 style="margin-top:0;">Histórico de Orçamentos</h3><div id="budgetHistory" class="budget-mini-list"></div></div></div></div>`;
    document.body.appendChild(back);
    const close=()=>document.body.removeChild(back);
    $("#fecharBudget",back).addEventListener("click",close);
    const erro=$("#budgetErro",back), history=$("#budgetHistory",back), itemsWrap=$("#itemsWrap",back), subtotal=$("#budgetSubtotal",back), total=$("#budgetTotal",back);
    const clientName=$("#budgetClientName",back), clientPhone=$("#budgetClientPhone",back), desc=$("#budgetDescription",back), discount=$("#budgetDiscount",back);
    const state={pipeline:null,budgets:[],budgetId:null,items:[]};
    function setError(msg){ erro.textContent=msg||""; if(msg) erro.classList.add("show"); else erro.classList.remove("show"); }
    function recalc(){ state.items.forEach(x=>{x.quantity=num(x.quantity);x.unit_price=num(x.unit_price);x.total_price=Number((x.quantity*x.unit_price).toFixed(2));}); const sub=state.items.reduce((a,x)=>a+Number(x.total_price||0),0); const disc=num(discount.value); const tot=Math.max(0, sub-disc); subtotal.textContent=money(sub); total.textContent=money(tot); return {subtotal:sub,discount_value:disc,total:tot};}
    function renderItems(){ if(!state.items.length){itemsWrap.innerHTML=`<div class="empty">Nenhum item adicionado.</div>`; recalc(); return;}
      itemsWrap.innerHTML=`<table class="budget-items-table"><thead><tr><th>Tipo</th><th>Descrição</th><th>Qtd</th><th>Vr. Unit.</th><th>Total</th><th></th></tr></thead><tbody>${state.items.map((it,idx)=>`<tr><td><select class="select jsType" data-idx="${idx}"><option value="servico" ${it.item_type==="servico"?"selected":""}>Serviço</option><option value="produto" ${it.item_type==="produto"?"selected":""}>Produto</option></select></td><td><input class="field jsDesc" data-idx="${idx}" value="${esc(it.description||"")}"></td><td><input class="field jsQty" data-idx="${idx}" type="number" step="0.001" min="0" value="${esc(it.quantity||1)}"></td><td><input class="field jsUnit" data-idx="${idx}" type="number" step="0.01" min="0" value="${esc(it.unit_price||0)}"></td><td>${money(it.total_price||0)}</td><td><button class="btn btn-ghost jsDel" data-idx="${idx}">Remover</button></td></tr>`).join("")}</tbody></table>`;
      $all(".jsType",itemsWrap).forEach(el=>el.addEventListener("change",e=>{ const i=Number(e.target.dataset.idx); state.items[i].item_type=e.target.value; }));
      $all(".jsDesc",itemsWrap).forEach(el=>el.addEventListener("input",e=>{ const i=Number(e.target.dataset.idx); state.items[i].description=e.target.value; }));
      $all(".jsQty",itemsWrap).forEach(el=>el.addEventListener("input",e=>{ const i=Number(e.target.dataset.idx); state.items[i].quantity=num(e.target.value); renderItems(); }));
      $all(".jsUnit",itemsWrap).forEach(el=>el.addEventListener("input",e=>{ const i=Number(e.target.dataset.idx); state.items[i].unit_price=num(e.target.value); renderItems(); }));
      $all(".jsDel",itemsWrap).forEach(el=>el.addEventListener("click",e=>{ const i=Number(e.target.dataset.idx); state.items.splice(i,1); renderItems(); }));
      recalc();
    }
    function loadForm(b,items){ state.budgetId=b?b.id:null; clientName.value=b?.client_name||ticket.client_name||""; clientPhone.value=b?.client_phone||ticket.client_phone||""; desc.value=b?.description||ticket.description||""; discount.value=String(b?.discount_value||0); state.items=(items||[]).map(x=>({item_type:x.item_type||"servico",description:x.description||"",quantity:Number(x.quantity||1),unit_price:Number(x.unit_price||0),total_price:Number(x.total_price||0)})); renderItems(); }
    async function refreshData(){ setError(""); state.pipeline=await ensurePipeline(ctx,ticket); state.budgets=await loadBudgets(ctx,ticket.id); if(state.budgets.length){ const first=state.budgets[0]; const items=await loadItems(ctx,first.id); loadForm(first,items);} else loadForm(null,[]); history.innerHTML=state.budgets.length?state.budgets.map(b=>`<div class="budget-mini-card"><div class="budget-mini-top"><div><strong>Versão ${esc(b.version||1)}</strong><div class="budget-small">${esc(dt(b.created_at))}</div></div><div>${badge(b.status)}</div></div><div class="budget-small">Total: ${money(b.total||0)}</div><div class="modal-actions" style="margin-top:10px;"><button class="btn btn-secondary jsLoad" data-id="${b.id}">Carregar</button></div></div>`).join(""):`<div class="empty">Nenhum orçamento salvo ainda.</div>`; $all(".jsLoad",history).forEach(btn=>btn.addEventListener("click", async()=>{ const b=state.budgets.find(x=>x.id===btn.dataset.id); if(!b)return; const items=await loadItems(ctx,b.id); loadForm(b,items); })); }
    async function doSave(status){ try{ setError(""); if(!state.pipeline) state.pipeline=await ensurePipeline(ctx,ticket); const calc=recalc(); if(!state.items.length) throw new Error("Adicione pelo menos um item no orçamento."); if(state.items.some(x=>!String(x.description||"").trim())) throw new Error("Todos os itens precisam ter descrição."); const current=state.budgets.find(b=>b.id===state.budgetId)||null; const nextVer=current?current.version:((state.budgets.length?Math.max(...state.budgets.map(x=>Number(x.version||1))):0)+1); const id=await saveBudget(ctx,{id:state.budgetId,ticket_id:ticket.id,pipeline_id:state.pipeline.id,customer_id:ticket.customer_id||null,client_name:clientName.value.trim(),client_phone:clientPhone.value.trim(),description:desc.value.trim(),subtotal:calc.subtotal,discount_value:calc.discount_value,total:calc.total,status,version:nextVer},state.items); state.budgetId=id; if(status==="approved") await ctx.sb.db.from("budgets").update({approved_at:new Date().toISOString()}).eq("id",id).eq("company_id",ctx.companyId); await refreshData(); if(typeof refresh==="function") await refresh(); alert(status==="draft"?"Rascunho salvo.":status==="sent"?"Orçamento marcado como enviado.":status==="approved"?"Orçamento aprovado.":status==="rejected"?"Orçamento rejeitado.":"Orçamento salvo."); } catch(e){ setError(e.message||String(e)); } }
    $("#addServico",back).addEventListener("click",()=>{ state.items.push({item_type:"servico",description:"",quantity:1,unit_price:0,total_price:0}); renderItems(); });
    $("#addProduto",back).addEventListener("click",()=>{ state.items.push({item_type:"produto",description:"",quantity:1,unit_price:0,total_price:0}); renderItems(); });
    $("#novoRascunho",back).addEventListener("click",()=>{ state.budgetId=null; desc.value=ticket.description||""; discount.value="0"; state.items=[]; renderItems(); });
    discount.addEventListener("input",recalc);
    $("#saveDraft",back).addEventListener("click",()=>doSave("draft"));
    $("#markSent",back).addEventListener("click",()=>doSave("sent"));
    $("#markApproved",back).addEventListener("click",()=>doSave("approved"));
    $("#markRejected",back).addEventListener("click",()=>doSave("rejected"));
    $("#convertOs",back).addEventListener("click",async()=>{ try{ setError(""); const cur=state.budgets.find(x=>x.id===state.budgetId); if(!cur) throw new Error("Salve o orçamento antes de converter em OS."); if(!["approved","converted"].includes(String(cur.status||"").toLowerCase())) throw new Error("A OS só pode ser criada a partir de orçamento aprovado."); const osId=await convertToOs(ctx,cur,ticket); await refreshData(); if(typeof refresh==="function") await refresh(); alert("OS criada com sucesso. ID: "+osId); }catch(e){ setError(e.message||String(e)); }});
    refreshData();
  }
  window.ModuloBudgets={ abrirModalOrcamento, renderBudgetsResumoHtml, ensurePipeline };
})();
