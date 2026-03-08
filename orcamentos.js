
(function () {
  "use strict";
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.from((r||document).querySelectorAll(s))}
  function e(t){return String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
  function dh(v){if(!v)return "—"; const x=new Date(v); return Number.isNaN(x.getTime())?String(v):x.toLocaleString("pt-BR")}
  function m(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0))}
  function hoje(){return new Date().toISOString().slice(0,10)}
  function badge(s){const x=String(s||"").toLowerCase(); const mp={draft:"Rascunho",sent:"Enviado",approved:"Aprovado",rejected:"Recusado",partially_approved:"Parcialmente aprovado"}; return `<span class="status-pill status-${e(x)}">${e(mp[x]||s||"—")}</span>`}
  async function listarOrcamentos(ctx){
    const alvo=document.getElementById(ctx.areaId);
    if(!alvo) throw new Error("Área de orçamentos não encontrada.");
    if(!ctx.sb||!ctx.sb.db) throw new Error("Supabase não disponível.");
    if(!ctx.companyId) throw new Error("Company ID não configurado.");
    const state={busca:"",status:"",selecionado:null,orcamentos:[]};
    alvo.innerHTML=`<div class="orc-resumo"><div class="orc-card"><div class="orc-card-label">Total de Orçamentos</div><div class="orc-card-value" id="resumoTotalOrc">0</div></div><div class="orc-card"><div class="orc-card-label">Rascunhos</div><div class="orc-card-value" id="resumoDraft">0</div></div><div class="orc-card"><div class="orc-card-label">Enviados</div><div class="orc-card-value" id="resumoSent">0</div></div><div class="orc-card"><div class="orc-card-label">Aprovados</div><div class="orc-card-value" id="resumoApproved">0</div></div></div><div class="orc-toolbar"><input id="filtroBuscaOrc" class="field" placeholder="Buscar por cliente, ticket ou ID do orçamento"><select id="filtroStatusOrc" class="select"><option value="">Todos os status</option><option value="draft">Rascunho</option><option value="sent">Enviado</option><option value="approved">Aprovado</option><option value="rejected">Recusado</option><option value="partially_approved">Parcialmente aprovado</option></select></div><div class="orc-grid"><div class="panel"><h2>Lista de orçamentos</h2><div class="panel-sub">Orçamentos gerados a partir dos chamados</div><div id="listaOrcamentosWrap"></div></div><div class="panel"><h2>Detalhe do orçamento</h2><div class="panel-sub">Itens, totais, OS e recebíveis</div><div id="detalheOrcamentoWrap" class="empty">Selecione um orçamento.</div></div></div>`;
    $("#filtroBuscaOrc",alvo).addEventListener("input",async e1=>{state.busca=e1.target.value||""; await carregarLista();});
    $("#filtroStatusOrc",alvo).addEventListener("change",async e1=>{state.status=e1.target.value||""; await carregarLista();});
    await carregarLista();

    async function carregarLista(){
      const wrap=$("#listaOrcamentosWrap",alvo); wrap.innerHTML='<div class="empty">Carregando orçamentos...</div>';
      let q=ctx.sb.db.from("quotes").select("id,ticket_id,customer_id,status,subtotal,discount,surcharge,total,created_at,updated_at,version").eq("company_id",ctx.companyId).order("created_at",{ascending:false});
      if(state.status) q=q.eq("status",state.status);
      const {data,error}=await q; if(error){wrap.innerHTML='<div class="empty">Falha ao carregar orçamentos.</div>'; throw error;}
      const busca=state.busca.trim().toLowerCase();
      state.orcamentos=(data||[]).filter(x=>!busca||[x.id,x.ticket_id,x.customer_id,x.status].join(" ").toLowerCase().includes(busca));
      $("#resumoTotalOrc").textContent=String(state.orcamentos.length);
      $("#resumoDraft").textContent=String(state.orcamentos.filter(x=>x.status==="draft").length);
      $("#resumoSent").textContent=String(state.orcamentos.filter(x=>x.status==="sent").length);
      $("#resumoApproved").textContent=String(state.orcamentos.filter(x=>x.status==="approved").length);
      if(!state.orcamentos.length){wrap.innerHTML='<div class="empty">Nenhum orçamento encontrado.</div>'; $("#detalheOrcamentoWrap",alvo).innerHTML='<div class="empty">Selecione um orçamento.</div>'; return;}
      wrap.innerHTML=state.orcamentos.map(x=>`<div class="orc-list-item ${state.selecionado&&state.selecionado.id===x.id?"active":""}" data-id="${x.id}"><div class="orc-top"><div><div class="orc-title">Orçamento v${e(x.version||1)}</div><div class="orc-id">ID: ${e(x.id)}</div></div><div>${badge(x.status)}</div></div><div class="orc-meta">Ticket: ${e(x.ticket_id||"—")}</div><div class="orc-meta">Criado em: ${e(dh(x.created_at))}</div><div style="margin-top:8px"><strong>Total:</strong> ${m(x.total||0)}</div></div>`).join("");
      $$(".orc-list-item",wrap).forEach(el=>el.addEventListener("click",async()=>{const id=el.getAttribute("data-id"); state.selecionado=state.orcamentos.find(y=>y.id===id)||null; await carregarDetalhe(); await carregarLista();}));
      if(!state.selecionado) state.selecionado=state.orcamentos[0];
      await carregarDetalhe();
    }

    async function carregarDetalhe(){
      const wrap=$("#detalheOrcamentoWrap",alvo); if(!state.selecionado){wrap.innerHTML='<div class="empty">Selecione um orçamento.</div>'; return;}
      wrap.innerHTML='<div class="empty">Carregando detalhe...</div>';
      const [ticketResp,workorderResp,recResp]=await Promise.all([
        state.selecionado.ticket_id?ctx.sb.db.from("tickets").select("id,client_name,client_phone,description,customer_id").eq("id",state.selecionado.ticket_id).maybeSingle():Promise.resolve({data:null}),
        ctx.sb.db.from("workorders").select("id,status").eq("quote_id",state.selecionado.id).maybeSingle(),
        ctx.sb.db.from("receivables").select("id,due_date,amount,paid,paid_at").eq("quote_id",state.selecionado.id).order("due_date",{ascending:true})
      ]);
      const ticket=ticketResp.data||null, wo=workorderResp.data||null, recs=recResp.data||[];
      wrap.innerHTML=`<div class="quote-header-actions"><div><div class="orc-title">Orçamento v${e(state.selecionado.version||1)}</div><div class="orc-id">ID: ${e(state.selecionado.id)}</div></div><div>${badge(state.selecionado.status)}</div></div><div class="orc-actions" style="margin-top:12px"><button id="btnGerarRecebiveis" class="btn btn-success">Gerar Parcelas / Recebíveis</button></div><div class="quote-info-box"><div><strong>Cliente:</strong> ${e(ticket?.client_name||"—")}</div><div><strong>Telefone:</strong> ${e(ticket?.client_phone||"—")}</div><div><strong>Valor do orçamento:</strong> ${m(state.selecionado.total||0)}</div><div><strong>OS:</strong> ${e(wo?.id||"—")}</div></div><div class="quote-info-box"><div class="mini-card-title">Recebíveis gerados</div>${recs.length?recs.map(r=>`<div class="receber-line"><div><div>Vencimento: ${e(r.due_date||"—")}</div><div class="mini-muted">Pago em: ${e(dh(r.paid_at))}</div></div><div style="text-align:right"><div>${m(r.amount||0)}</div><div>${r.paid?"Pago":"Em aberto"}</div></div></div>`).join(""):'<div class="mini-muted">Nenhum recebível criado ainda.</div>'}</div>`;
      $("#btnGerarRecebiveis",wrap).addEventListener("click",async()=>{await modalParcelas(ctx,state.selecionado,ticket,wo); await carregarDetalhe();});
    }
  }

  async function modalParcelas(ctx,quote,ticket,wo){
    const total=Number(quote.total||0);
    const backdrop=document.createElement("div"); backdrop.className="modal-backdrop";
    backdrop.innerHTML=`<div class="modal"><div class="modal-head"><div><div class="modal-title">Gerar Parcelas / Recebíveis</div><div class="panel-sub">Criar contas a receber vinculadas ao orçamento</div></div><button class="btn btn-ghost" id="fecharModalParcelas">Fechar</button></div><div class="alert error" id="erroModalParcelas"></div><div class="quote-info-box"><div><strong>Cliente:</strong> ${e(ticket?.client_name||"—")}</div><div><strong>Valor total:</strong> ${m(total)}</div></div><div class="grid-form" style="margin-top:12px"><div><label class="label">Quantidade de parcelas</label><input id="parcelasQtd" class="field" type="number" min="1" max="12" value="3"></div><div><label class="label">1º vencimento</label><input id="parcelasPrimeiroVenc" class="field" type="date" value="${hoje()}"></div><div><label class="label">Intervalo em dias</label><input id="parcelasIntervalo" class="field" type="number" min="1" value="15"></div></div><div class="modal-actions"><button class="btn btn-secondary" id="parcelasGerarIgual">Distribuir Igual</button><button class="btn btn-primary" id="parcelasMontar">Montar Parcelas</button></div><div id="parcelasLista" style="margin-top:12px"></div><div class="modal-actions" style="margin-top:12px"><button class="btn btn-secondary" id="cancelarModalParcelas">Cancelar</button><button class="btn btn-success" id="confirmarModalParcelas">Confirmar e Gerar</button></div></div>`;
    document.body.appendChild(backdrop);
    const fechar=()=>document.body.removeChild(backdrop);
    $("#fecharModalParcelas",backdrop).addEventListener("click",fechar);
    $("#cancelarModalParcelas",backdrop).addEventListener("click",fechar);
    const erro=$("#erroModalParcelas",backdrop);
    function somaDias(dataISO,dias){const x=new Date(dataISO+"T12:00:00"); x.setDate(x.getDate()+dias); return x.toISOString().slice(0,10);}
    function renderLinhas(ls){ $("#parcelasLista",backdrop).innerHTML=`<div class="table-wrap"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr></thead><tbody>${ls.map((l,i)=>`<tr><td>${i+1}</td><td><input class="field parcela-data" data-index="${i}" type="date" value="${l.due_date}"></td><td><input class="field parcela-valor" data-index="${i}" type="number" step="0.01" value="${l.amount}"></td></tr>`).join("")}</tbody></table></div>`; }
    function montar(){ const qtd=Math.max(1,Number($("#parcelasQtd",backdrop).value||1)); const primeiro=$("#parcelasPrimeiroVenc",backdrop).value||hoje(); const intervalo=Math.max(1,Number($("#parcelasIntervalo",backdrop).value||15)); const base=Math.floor((total/qtd)*100)/100; let rest=Number((total-(base*qtd)).toFixed(2)); const ls=[]; for(let i=0;i<qtd;i++){ let valor=base; if(i===qtd-1) valor=Number((base+rest).toFixed(2)); ls.push({due_date:somaDias(primeiro,intervalo*i),amount:valor}); } renderLinhas(ls); }
    $("#parcelasGerarIgual",backdrop).addEventListener("click",montar);
    $("#parcelasMontar",backdrop).addEventListener("click",montar);
    montar();
    $("#confirmarModalParcelas",backdrop).addEventListener("click",async()=>{
      erro.textContent=""; erro.classList.remove("show");
      const datas=$$(".parcela-data",backdrop).map(x=>x.value), valores=$$(".parcela-valor",backdrop).map(x=>Number(x.value||0));
      const soma=valores.reduce((a,v)=>a+Number(v||0),0);
      if(!datas.length){erro.textContent="Monte as parcelas antes de confirmar."; erro.classList.add("show"); return;}
      if(Math.abs(soma-total)>0.02){erro.textContent=`A soma das parcelas (${m(soma)}) deve ser igual ao total do orçamento (${m(total)}).`; erro.classList.add("show"); return;}
      try{
        const ex=await ctx.sb.db.from("receivables").select("id").eq("quote_id",quote.id);
        if(ex.error) throw ex.error;
        if((ex.data||[]).length){erro.textContent="Este orçamento já possui recebíveis gerados."; erro.classList.add("show"); return;}
        const payload=datas.map((dt,i)=>({company_id:ctx.companyId, customer_id:ticket?.customer_id||quote.customer_id||null, quote_id:quote.id, workorder_id:wo?.id||null, amount:Number(valores[i]||0), due_date:dt, paid:false}));
        const ins=await ctx.sb.db.from("receivables").insert(payload);
        if(ins.error) throw ins.error;
        fechar(); alert("Recebíveis gerados com sucesso.");
      }catch(ex){erro.textContent=ex.message||String(ex); erro.classList.add("show");}
    });
  }

  window.ModuloOrcamentos={ listarOrcamentos };
})();
