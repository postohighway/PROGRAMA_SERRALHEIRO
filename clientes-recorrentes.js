(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }

  function escapeHtml(t) {
    return String(t || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function formatarData(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
  }

  function formatarDataLonga(v) {
    if (!v) return "";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  }

  function vigenciaAte(startDate) {
    if (!startDate) return "";
    const d = new Date(startDate + "T12:00:00");
    if (Number.isNaN(d.getTime())) return "";
    d.setMonth(d.getMonth() + 12);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }

  function moeda(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
  }

  function statusPill(status, tipo) {
    const s = String(status || "").toLowerCase().trim();
    let cls = "status-pill";
    if (tipo === "contrato") {
      if (s === "ativo") cls += " status-finalizado";
      else if (s === "suspenso") cls += " status-aguardando_analise";
      else if (s === "cancelado") cls += " status-cancelado";
      else cls += " status-aberto";
    } else if (tipo === "recebivel") {
      cls += s === "pago" || s === "paid" ? " status-finalizado" : " status-aberto";
    } else {
      cls += ["finalizado", "finalizada", "cancelado", "cancelada"].includes(s) ? " status-cancelado" : " status-aberto";
    }
    return `<span class="${cls}">${escapeHtml(status || "—")}</span>`;
  }

  async function abrirHubCliente(ctx, customer) {
    if (!customer || !customer.id) return;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" style="max-width:900px;">
        <div class="modal-head">
          <div><div class="modal-title">Hub — ${escapeHtml(customer.name || "Cliente")}</div><div class="panel-sub">Contrato, chamados, OS e financeiro</div></div>
          <button class="btn btn-ghost" id="fecharHubCliente">Fechar</button>
        </div>
        <div id="hubClienteConteudo" class="panel" style="margin:16px 0;">
          <div class="placeholder-big">Carregando...</div>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharHubCliente", backdrop).addEventListener("click", fechar);

    const wrap = $("#hubClienteConteudo", backdrop);

    try {
      const [contratosRes, ticketsRes, workordersRes, receivablesRes, timelineRes] = await Promise.all([
        ctx.sb.db.from("contracts").select("id, name, amount, status, start_date, next_billing_date, signed_at, signed_by").eq("company_id", ctx.companyId).eq("customer_id", customer.id).order("created_at", { ascending: false }),
        ctx.sb.db.from("tickets").select("id, client_name, description, status, created_at, due_date").eq("company_id", ctx.companyId).eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(10),
        ctx.sb.db.from("workorders").select("id, os_number, desc, status, created_at, due_date").eq("company_id", ctx.companyId).eq("client_id", customer.id).order("created_at", { ascending: false }).limit(10),
        ctx.sb.db.from("receivables").select("id, due_date, amount, paid, paid_at").eq("company_id", ctx.companyId).eq("customer_id", customer.id).order("due_date", { ascending: false }).limit(12),
        ctx.sb.db.from("client_timeline").select("id, tipo, titulo, conteudo, created_at").eq("company_id", ctx.companyId).eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(10).then((r) => r.error ? { data: [] } : r)
      ]);

      const contratos = contratosRes.data || [];
      const tickets = ticketsRes.data || [];
      const workorders = workordersRes.data || [];
      const receivables = receivablesRes.data || [];
      const timeline = Array.isArray(timelineRes.data) ? timelineRes.data : (timelineRes.data ? [timelineRes.data] : []);

      const totalReceita = receivables.reduce((a, r) => a + Number(r.amount || 0), 0);
      const totalPago = receivables.filter((r) => r.paid).reduce((a, r) => a + Number(r.amount || 0), 0);
      const totalAberto = receivables.filter((r) => !r.paid).reduce((a, r) => a + Number(r.amount || 0), 0);

      const htmlContratos = contratos.length
        ? contratos.map((c) => {
            const vig = vigenciaAte(c.start_date || c.signed_at);
            const assinadoVig = c.signed_at
              ? `<div class="muted" style="font-size:12px;margin-top:4px;">Assinado em ${formatarDataLonga(c.signed_at)}${vig ? " • Vigente até " + vig : ""}</div>`
              : vig ? `<div class="muted" style="font-size:12px;margin-top:4px;">Vigente até ${vig}</div>` : "";
            return `<div class="line-item"><div class="line-top"><div>${escapeHtml(c.name || "Contrato")}</div><div>${statusPill(c.status, "contrato")}</div></div><div>${moeda(c.amount)} • Próxima: ${formatarData(c.next_billing_date)}</div>${assinadoVig}</div>`;
          }).join("")
        : `<div class="empty">Nenhum contrato.</div>`;

      const htmlTickets = tickets.length
        ? tickets.map((t) => `<div class="line-item"><div class="line-top"><div>${formatarData(t.created_at)}</div><div>${statusPill(t.status, "ticket")}</div></div><div>${escapeHtml(t.client_name || "Chamado")}</div><div class="muted" style="margin-top:4px;">${escapeHtml((t.description || "").slice(0, 80))}${(t.description || "").length > 80 ? "…" : ""}</div></div>`).join("")
        : `<div class="empty">Nenhum chamado.</div>`;

      const htmlOS = workorders.length
        ? workorders.map((w) => `<div class="line-item"><div class="line-top"><div>OS-${String(w.os_number || "—").padStart(5, "0")}</div><div>${statusPill(w.status, "os")}</div></div><div>${escapeHtml((w.desc || "").slice(0, 60))}</div></div>`).join("")
        : `<div class="empty">Nenhuma OS.</div>`;

      const htmlReceivables = receivables.length
        ? receivables.map((r) => `<div class="line-item"><div class="line-top"><div>${formatarData(r.due_date)}</div><div>${r.paid ? statusPill("Pago", "recebivel") : statusPill("Em aberto", "recebivel")}</div></div><div>${moeda(r.amount)}</div></div>`).join("")
        : `<div class="empty">Nenhum recebível.</div>`;

      const htmlTimeline = timeline.length
        ? timeline.map((e) => `<div class="line-item"><div class="line-top"><div>${formatarData(e.created_at)}</div><div class="muted">${escapeHtml(e.tipo || "—")}</div></div><div>${escapeHtml(e.titulo || e.conteudo || "—")}</div></div>`).join("")
        : `<div class="empty">Nenhum registro na timeline.</div>`;

      wrap.innerHTML = `
        <div class="cards" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
          <div class="card"><div class="card-label">Contratos</div><div class="card-value">${contratos.length}</div></div>
          <div class="card"><div class="card-label">Chamados</div><div class="card-value">${tickets.length}</div></div>
          <div class="card"><div class="card-label">OS</div><div class="card-value">${workorders.length}</div></div>
          <div class="card"><div class="card-label">A receber</div><div class="card-value">${moeda(totalAberto)}</div></div>
        </div>

        <div class="grid-2" style="gap:16px;">
          <div class="panel"><h3>Contratos</h3><div class="list-lines">${htmlContratos}</div></div>
          <div class="panel"><h3>Chamados recentes</h3><div class="list-lines">${htmlTickets}</div></div>
          <div class="panel"><h3>Ordens de Serviço</h3><div class="list-lines">${htmlOS}</div></div>
          <div class="panel"><h3>Contas a receber</h3><div class="list-lines">${htmlReceivables}</div></div>
        </div>

        <div class="panel" style="margin-top:16px;"><h3>Timeline</h3><div class="list-lines">${htmlTimeline}</div></div>

        <div style="margin-top:16px;display:flex;gap:10px;">
          <a href="#chamados" class="btn btn-secondary">Ver todos os chamados</a>
          <a href="#ordens" class="btn btn-secondary">Ver ordens</a>
          <a href="#financeiro" class="btn btn-secondary">Financeiro</a>
          <a href="#recorrencia" class="btn btn-secondary">Recorrência</a>
        </div>
      `;
    } catch (err) {
      wrap.innerHTML = `<div class="empty">Erro ao carregar: ${escapeHtml(err.message || err)}</div>`;
    }
  }

  window.ModuloClientesRecorrentes = window.ModuloClientesRecorrentes || {};
  window.ModuloClientesRecorrentes.abrirHubCliente = abrirHubCliente;
})();
