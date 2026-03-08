
(function () {
  "use strict";
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.from((r||document).querySelectorAll(s))}
  function e(t){return String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
  function d(v){if(!v)return "—"; const x=new Date(v); return Number.isNaN(x.getTime())?String(v):x.toLocaleDateString("pt-BR")}
  function dh(v){if(!v)return "—"; const x=new Date(v); return Number.isNaN(x.getTime())?String(v):x.toLocaleString("pt-BR")}
  function m(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0))}
  function hoje(){return new Date().toISOString().slice(0,10)}
  function inicioMes(){const x=new Date(); x.setDate(1); return x.toISOString().slice(0,10)}
  function badgeRec(r){ if(r.paid) return '<span class="status-pill status-approved">Pago</span>'; return r.due_date && r.due_date<hoje() ? '<span class="status-pill status-rejected">Vencido</span>' : '<span class="status-pill status-draft">Em aberto</span>'; }
  function css(){
    if(document.getElementById("css-financeiro-v3")) return;
    const st=document.createElement("style"); st.id="css-financeiro-v3";
    st.textContent=`
      .fin-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      .fin-tab{border:none;background:#1b3560;color:#fff;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer}
      .fin-tab.active{background:#4b87f5}
      .fin-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:14px}
      .fin-kpi,.fin-card,.fin-rec-card,.fin-obra-card{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .fin-kpi-label,.fin-meta{font-size:12px;color:#9db3d6}
      .fin-kpi-value,.fin-title{font-weight:800;color:#eff6ff}
      .fin-kpi-value{font-size:20px}
      .fin-grid{display:grid;grid-template-columns:1.1fr 1.1fr;gap:18px}
      .fin-subgrid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
      .fin-list-line{border-bottom:1px solid rgba(108,152,232,.10);padding:10px 0}
      .fin-list-line:last-child{border-bottom:none}
      .fin-toolbar,.fin-actions{display:flex;gap:8px;flex-wrap:wrap}
      .fin-rec-card{margin-bottom:10px}
      .fin-rec-top,.fin-obra-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .btn.btn-success{background:#14845f;color:#fff}
      @media (max-width:1200px){.fin-kpis{grid-template-columns:repeat(3,1fr)} .fin-grid,.fin-subgrid{grid-template-columns:1fr}}
      @media (max-width:700px){.fin-kpis{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }

  async function listarFinanceiro(ctx){
    css();
    const alvo=document.getElementById(ctx.areaId);
    if(!alvo) throw new Error("Área de financeiro não encontrada.");
    if(!ctx.sb||!ctx.sb.db) throw new Error("Supabase não disponível.");
    if(!ctx.companyId) throw new Error("Company ID não configurado.");
    const state={aba:"executivo"};
    alvo.innerHTML=`<div class="fin-tabs">
      <button class="fin-tab active" data-tab="executivo">Executivo</button>
      <button class="fin-tab" data-tab="obras">Por Obra</button>
      <button class="fin-tab" data-tab="receber">Contas a Receber</button>
      <button class="fin-tab" data-tab="caixa">Fluxo de Caixa</button>
    </div><div id="financeiroConteudo"></div>`;
    $$(".fin-tab",alvo).forEach(btn=>btn.addEventListener("click",async()=>{state.aba=btn.getAttribute("data-tab"); $$(".fin-tab",alvo).forEach(x=>x.classList.toggle("active",x===btn)); await render();}));
    await render();

    async function base(){
      const ini=`${inicioMes()}T00:00:00`;
      const [rr,pr,cr,qr,wr,tr,cur]=await Promise.all([
        ctx.sb.db.from("receivables").select("id,due_date,amount,paid,paid_at,company_id,customer_id,quote_id,workorder_id,contract_id").eq("company_id",ctx.companyId),
        ctx.sb.db.from("payments").select("id,amount,paid_at,created_at,note,quote_id,ticket_id,company_id,receivable_id").eq("company_id",ctx.companyId),
        ctx.sb.db.from("purchases").select("id,workorder_id,description,total,status,created_at,paid_at,company_id").eq("company_id",ctx.companyId),
        ctx.sb.db.from("quotes").select("id,ticket_id,status,total,customer_id,created_at,approved_at,company_id").eq("company_id",ctx.companyId),
        ctx.sb.db.from("workorders").select("id,quote_id,ticket_id,desc,status,due_date,created_at,company_id").eq("company_id",ctx.companyId),
        ctx.sb.db.from("txs").select("id,type,desc,amount,due_date,status,category,created_at,receivable_id,workorder_id,quote_id,purchase_id,company_id").eq("company_id",ctx.companyId),
        ctx.sb.db.from("customers").select("id,name,phone,email").eq("company_id",ctx.companyId),
      ]);
      for(const r of [rr,pr,cr,qr,wr,tr,cur]) if(r.error) throw r.error;
      const cmap=new Map((cur.data||[]).map(c=>[c.id,c]));
      return {hoje:hoje(), inicio:ini, receivables:rr.data||[], payments:pr.data||[], purchases:cr.data||[], quotes:qr.data||[], workorders:wr.data||[], txs:tr.data||[], customerMap:cmap};
    }

    async function render(){
      const box=$("#financeiroConteudo",alvo);
      box.innerHTML=`<div class="empty">Carregando financeiro...</div>`;
      if(state.aba==="executivo") return executivo(box);
      if(state.aba==="obras") return obras(box);
      if(state.aba==="receber") return receber(box);
      return caixa(box);
    }

    async function executivo(box){
      const b=await base();
      const receberAberto=b.receivables.filter(r=>!r.paid).reduce((a,r)=>a+Number(r.amount||0),0);
      const receberVencido=b.receivables.filter(r=>!r.paid&&r.due_date&&r.due_date<b.hoje).reduce((a,r)=>a+Number(r.amount||0),0);
      const recebidoMes=b.payments.filter(p=>(p.paid_at||p.created_at||"")>=b.inicio).reduce((a,p)=>a+Number(p.amount||0),0);
      const comprasMes=b.purchases.filter(p=>(p.created_at||"")>=b.inicio).reduce((a,p)=>a+Number(p.total||0),0);
      const faturamento=b.quotes.filter(q=>q.status==="approved").reduce((a,q)=>a+Number(q.total||0),0);
      const lucro=faturamento-b.purchases.reduce((a,p)=>a+Number(p.total||0),0);
      const margem=faturamento>0?(lucro/faturamento)*100:0;
      const topR=[...b.receivables].filter(r=>!r.paid).sort((a,b2)=>String(a.due_date||"").localeCompare(String(b2.due_date||""))).slice(0,8);
      const topC=[...b.purchases].sort((a,b2)=>String(b2.created_at||"").localeCompare(String(a.created_at||""))).slice(0,8);
      box.innerHTML=`<div class="fin-kpis">
        <div class="fin-kpi"><div class="fin-kpi-label">A Receber</div><div class="fin-kpi-value">${m(receberAberto)}</div></div>
        <div class="fin-kpi"><div class="fin-kpi-label">Recebido no Mês</div><div class="fin-kpi-value">${m(recebidoMes)}</div></div>
        <div class="fin-kpi"><div class="fin-kpi-label">Compras no Mês</div><div class="fin-kpi-value">${m(comprasMes)}</div></div>
        <div class="fin-kpi"><div class="fin-kpi-label">Faturamento Previsto</div><div class="fin-kpi-value">${m(faturamento)}</div></div>
        <div class="fin-kpi"><div class="fin-kpi-label">Vencido</div><div class="fin-kpi-value">${m(receberVencido)}</div></div>
        <div class="fin-kpi"><div class="fin-kpi-label">Margem Média</div><div class="fin-kpi-value">${margem.toFixed(2)}%</div></div>
      </div>
      <div class="fin-grid">
        <div class="fin-card"><div class="fin-title">Próximos recebimentos</div>
          ${topR.length?topR.map(r=>{const c=b.customerMap.get(r.customer_id); return `<div class="fin-list-line"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><div>${e(c?.name||"Cliente")}</div><div class="fin-meta">Vencimento: ${e(d(r.due_date))}</div></div><div style="text-align:right"><div>${m(r.amount||0)}</div><div>${badgeRec(r)}</div></div></div></div>`}).join(""):'<div class="fin-meta">Nenhum recebível em aberto.</div>'}
        </div>
        <div class="fin-card"><div class="fin-title">Últimas compras</div>
          ${topC.length?topC.map(c=>`<div class="fin-list-line"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><div>${e(c.description||"Compra")}</div><div class="fin-meta">${e(dh(c.created_at))}</div></div><div style="text-align:right"><div>${m(c.total||0)}</div><div class="fin-meta">${e(c.status||"draft")}</div></div></div></div>`).join(""):'<div class="fin-meta">Nenhuma compra lançada.</div>'}
        </div>
      </div>`;
    }

    async function obras(box){
      const b=await base();
      const obras=b.workorders.map(os=>{
        const q=b.quotes.find(x=>x.id===os.quote_id)||null;
        const compras=b.purchases.filter(p=>p.workorder_id===os.id);
        const receber=b.receivables.filter(r=>r.workorder_id===os.id||r.quote_id===os.quote_id);
        const pagos=b.payments.filter(p=>p.quote_id===os.quote_id);
        const custo=compras.reduce((a,c)=>a+Number(c.total||0),0);
        const orcado=Number(q?.total||0);
        const recebido=pagos.reduce((a,p)=>a+Number(p.amount||0),0);
        const aReceber=receber.filter(r=>!r.paid).reduce((a,r)=>a+Number(r.amount||0),0);
        const lucro=orcado-custo; const margem=orcado>0?(lucro/orcado)*100:0;
        return {os,orcado,custo,recebido,aReceber,lucro,margem};
      }).sort((a,b2)=>b2.orcado-a.orcado);
      box.innerHTML=obras.length?obras.map(o=>`<div class="fin-obra-card"><div class="fin-obra-top"><div><div class="fin-title">OS ${e(o.os.id)}</div><div class="fin-meta">Orçamento: ${e(o.os.quote_id||"—")} • Status: ${e(o.os.status||"aberta")}</div><div class="fin-meta">${e(o.os.desc||"Sem descrição")}</div></div><div>${o.margem>=0?`<span class="status-pill status-approved">${o.margem.toFixed(2)}%</span>`:`<span class="status-pill status-rejected">${o.margem.toFixed(2)}%</span>`}</div></div><div class="fin-subgrid" style="margin-top:12px"><div class="fin-card"><div class="fin-meta">Orçado</div><div class="fin-title">${m(o.orcado)}</div></div><div class="fin-card"><div class="fin-meta">Compras</div><div class="fin-title">${m(o.custo)}</div></div><div class="fin-card"><div class="fin-meta">Recebido</div><div class="fin-title">${m(o.recebido)}</div></div><div class="fin-card"><div class="fin-meta">A Receber</div><div class="fin-title">${m(o.aReceber)}</div></div><div class="fin-card"><div class="fin-meta">Lucro Bruto</div><div class="fin-title">${m(o.lucro)}</div></div><div class="fin-card"><div class="fin-meta">Margem</div><div class="fin-title">${o.margem.toFixed(2)}%</div></div></div></div>`).join(""):`<div class="fin-card"><div class="fin-meta">Nenhuma obra encontrada.</div></div>`;
    }

    async function receber(box){
      const b=await base();
      const itens=[...b.receivables].sort((a,b2)=>String(a.due_date||"").localeCompare(String(b2.due_date||"")));
      box.innerHTML=`<div class="fin-card"><div class="fin-title">Contas a Receber</div><div class="fin-meta">Baixa profissional com geração automática em payments e txs</div><div style="margin-top:12px">${itens.length?itens.map(r=>{const c=b.customerMap.get(r.customer_id); return `<div class="fin-rec-card"><div class="fin-rec-top"><div><div class="fin-title">${e(c?.name||"Cliente")}</div><div class="fin-meta">Vencimento: ${e(d(r.due_date))}</div><div class="fin-meta">Origem: ${e(r.workorder_id||r.quote_id||r.contract_id||"—")}</div></div><div style="text-align:right"><div class="fin-title">${m(r.amount||0)}</div><div>${badgeRec(r)}</div></div></div><div class="fin-meta" style="margin-top:6px">Pago em: ${e(dh(r.paid_at))}</div><div class="fin-actions" style="margin-top:10px">${r.paid?'<button class="btn btn-secondary" disabled>Já pago</button>':`<button class="btn btn-success btnBaixarRecebivel" data-id="${r.id}">Baixar / Registrar Pagamento</button>`}<button class="btn btn-secondary btnHistoricoRecebivel" data-id="${r.id}">Ver pagamentos</button></div></div>`}).join(""):'<div class="fin-meta">Nenhuma conta a receber encontrada.</div>'}</div></div>`;
      $$(".btnBaixarRecebivel",box).forEach(btn=>btn.addEventListener("click",async()=>{const id=btn.getAttribute("data-id"); const item=itens.find(x=>x.id===id); await abrirModalBaixa(ctx,item,b.customerMap); await receber(box);}));
      $$(".btnHistoricoRecebivel",box).forEach(btn=>btn.addEventListener("click",()=>{const id=btn.getAttribute("data-id"); const pagamentos=b.payments.filter(p=>p.receivable_id===id); alert(pagamentos.length?pagamentos.map(p=>`${dh(p.paid_at||p.created_at)} • ${m(p.amount||0)} • ${e(p.note||"Sem observação")}`).join("\n"):"Nenhum pagamento registrado.");}));
    }

    async function caixa(box){
      const b=await base();
      const ent=b.txs.filter(t=>String(t.type||"").toLowerCase()==="entrada");
      const sai=b.txs.filter(t=>String(t.type||"").toLowerCase()==="saida");
      const entT=ent.reduce((a,t)=>a+Number(t.amount||0),0), saiT=sai.reduce((a,t)=>a+Number(t.amount||0),0), saldo=entT-saiT;
      const ult=[...b.txs].sort((a,b2)=>String(b2.created_at||"").localeCompare(String(a.created_at||""))).slice(0,20);
      box.innerHTML=`<div class="fin-kpis"><div class="fin-kpi"><div class="fin-kpi-label">Entradas</div><div class="fin-kpi-value">${m(entT)}</div></div><div class="fin-kpi"><div class="fin-kpi-label">Saídas</div><div class="fin-kpi-value">${m(saiT)}</div></div><div class="fin-kpi"><div class="fin-kpi-label">Saldo</div><div class="fin-kpi-value">${m(saldo)}</div></div><div class="fin-kpi"><div class="fin-kpi-label">Lançamentos</div><div class="fin-kpi-value">${b.txs.length}</div></div><div class="fin-kpi"><div class="fin-kpi-label">Entradas em aberto</div><div class="fin-kpi-value">${ent.filter(t=>String(t.status||"").toLowerCase()!=="pago").length}</div></div><div class="fin-kpi"><div class="fin-kpi-label">Saídas em aberto</div><div class="fin-kpi-value">${sai.filter(t=>String(t.status||"").toLowerCase()!=="pago").length}</div></div></div><div class="fin-card"><div class="fin-title">Fluxo de Caixa</div><div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Origem</th></tr></thead><tbody>${ult.length?ult.map(t=>`<tr><td>${e(t.type||"—")}</td><td>${e(t.desc||"—")}</td><td>${e(t.category||"—")}</td><td>${m(t.amount||0)}</td><td>${e(d(t.due_date))}</td><td>${e(t.status||"—")}</td><td>${e(t.workorder_id||t.quote_id||t.purchase_id||t.receivable_id||"—")}</td></tr>`).join(""):'<tr><td colspan="7">Nenhum lançamento encontrado.</td></tr>'}</tbody></table></div></div>`;
    }
  }

  async function abrirModalBaixa(ctx, recebivel, customerMap){
    const backdrop=document.createElement("div"); backdrop.className="modal-backdrop";
    const cliente=customerMap.get(recebivel.customer_id);
    backdrop.innerHTML=`<div class="modal"><div class="modal-head"><div><div class="modal-title">Baixar Recebível</div><div class="panel-sub">Registrar pagamento e lançar automaticamente no caixa</div></div><button class="btn btn-ghost" id="fecharModalBaixa">Fechar</button></div><div class="alert error" id="erroModalBaixa"></div><div class="quote-info-box"><div><strong>Cliente:</strong> ${e(cliente?.name||"Cliente")}</div><div><strong>Valor:</strong> ${m(recebivel.amount||0)}</div><div><strong>Vencimento:</strong> ${e(d(recebivel.due_date))}</div><div><strong>Origem:</strong> ${e(recebivel.workorder_id||recebivel.quote_id||recebivel.contract_id||"—")}</div></div><div class="grid-form" style="margin-top:12px"><div><label class="label">Valor pago</label><input id="baixaValor" class="field" type="number" step="0.01" value="${Number(recebivel.amount||0)}"></div><div><label class="label">Data do pagamento</label><input id="baixaData" class="field" type="date" value="${hoje()}"></div><div><label class="label">Método</label><select id="baixaMetodo" class="select"><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option><option value="transferencia">Transferência</option><option value="boleto">Boleto</option></select></div><div class="full"><label class="label">Observação</label><textarea id="baixaObs" class="textarea">Pagamento baixado pelo financeiro do sistema.</textarea></div></div><div class="modal-actions"><button class="btn btn-secondary" id="cancelarModalBaixa">Cancelar</button><button class="btn btn-success" id="confirmarModalBaixa">Confirmar Baixa</button></div></div>`;
    document.body.appendChild(backdrop);
    const fechar=()=>document.body.removeChild(backdrop);
    $("#fecharModalBaixa",backdrop).addEventListener("click",fechar);
    $("#cancelarModalBaixa",backdrop).addEventListener("click",fechar);
    const erro=$("#erroModalBaixa",backdrop);
    $("#confirmarModalBaixa",backdrop).addEventListener("click",async()=>{
      erro.textContent=""; erro.classList.remove("show");
      const valor=Number($("#baixaValor",backdrop).value||0);
      const dataPago=$("#baixaData",backdrop).value||hoje();
      const metodo=$("#baixaMetodo",backdrop).value;
      const obs=$("#baixaObs",backdrop).value.trim();
      if(valor<=0){erro.textContent="Informe um valor pago válido."; erro.classList.add("show"); return;}
      try{
        const pay=await ctx.sb.db.from("payments").insert({
          company_id: ctx.companyId,
          receivable_id: recebivel.id,
          quote_id: recebivel.quote_id || null,
          ticket_id: null,
          amount: valor,
          paid_at: `${dataPago}T12:00:00`,
          note: `${metodo.toUpperCase()} - ${obs}`
        }).select("id").maybeSingle();
        if(pay.error) throw pay.error;

        const tx=await ctx.sb.db.from("txs").insert({
          company_id: ctx.companyId,
          type: "entrada",
          desc: `Recebimento ${cliente?.name || "Cliente"} - ${metodo.toUpperCase()}`,
          amount: valor,
          due_date: dataPago,
          status: "pago",
          category: "recebimento",
          receivable_id: recebivel.id,
          quote_id: recebivel.quote_id || null,
          workorder_id: recebivel.workorder_id || null
        });
        if(tx.error) throw tx.error;

        const upd=await ctx.sb.db.from("receivables").update({paid:true, paid_at:`${dataPago}T12:00:00`}).eq("id", recebivel.id);
        if(upd.error) throw upd.error;

        fechar();
        alert("Pagamento baixado com sucesso e conciliado no caixa.");
      }catch(ex){erro.textContent=ex.message||String(ex); erro.classList.add("show");}
    });
  }

  window.ModuloFinanceiro={ listarFinanceiro };
})();
