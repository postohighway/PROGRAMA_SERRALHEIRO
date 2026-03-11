
(function () {
  "use strict";

  function inteiro(v) {
    return new Intl.NumberFormat("pt-BR").format(Number(v || 0));
  }

  function normalizarStatus(s) {
    return String(s || "").trim().toLowerCase();
  }

  function hojeStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function addDias(base, dias) {
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function fmtData(data) {
    if (!data) return "—";
    const d = new Date(String(data).length <= 10 ? data + "T00:00:00" : data);
    return d.toLocaleDateString("pt-BR");
  }

  function panel(title, subtitle, body) {
    return `
      <div class="panel">
        <h2>${title}</h2>
        ${subtitle ? `<div class="panel-sub">${subtitle}</div>` : ""}
        ${body}
      </div>
    `;
  }

  function linha(topLeft, topRight, main, sub) {
    return `
      <div class="line-item">
        <div class="line-top">
          <div>${topLeft || "—"}</div>
          <div>${topRight || ""}</div>
        </div>
        <div>${main || "—"}</div>
        ${sub ? `<div class="muted" style="margin-top:6px;">${sub}</div>` : ""}
      </div>
    `;
  }

  async function fetchAll(db, table, columns, companyId) {
    const r = await db.from(table).select(columns).eq("company_id", companyId);
    if (r.error) throw r.error;
    return r.data || [];
  }

  async function renderizarAgenda(opts) {
    const areaId = opts && opts.areaId ? opts.areaId : "conteudoTela";
    const sb = opts && opts.sb ? opts.sb : window.sb;
    const setErro = opts && opts.setErro ? opts.setErro : function(){};
    const setInfo = opts && opts.setInfo ? opts.setInfo : function(){};
    const setTitulo = opts && opts.setTitulo ? opts.setTitulo : function(){};

    setTitulo("Agenda", "Agenda operacional da equipe");
    setErro("");
    setInfo("");

    const alvo = document.getElementById(areaId);
    if (!alvo) return;

    alvo.innerHTML = panel(
      "Agenda",
      "Carregando agenda operacional...",
      `<div class="placeholder-big">Aguarde, carregando compromissos do sistema...</div>`
    );

    if (!(sb && sb.db && sb.companyId)) {
      setInfo("Conexão carregada, mas companyId ainda não está disponível.");
      return;
    }

    try {
      const hoje = hojeStr();
      const amanha = addDias(hoje, 1);
      const limite = addDias(hoje, 6);

      const tickets = await fetchAll(
        sb.db,
        "tickets",
        "id, status, due_date, created_at, client_name, client_phone, description",
        sb.companyId
      ).catch(() => []);

      const workorders = await fetchAll(
        sb.db,
        "workorders",
        "id, status, created_at, title, customer_name, notes, due_date, scheduled_date",
        sb.companyId
      ).catch(() => []);

      const ticketsComPrazo = tickets
        .filter((x) => !!x.due_date && !["finalizado", "cancelado"].includes(normalizarStatus(x.status)))
        .map((x) => ({ ...x, data_agenda: x.due_date }))
        .sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")));

      const osAgenda = workorders
        .map((x) => ({ ...x, data_agenda: x.scheduled_date || x.due_date || null }))
        .filter((x) => !!x.data_agenda && !["finalizado", "cancelado"].includes(normalizarStatus(x.status)))
        .sort((a, b) => String(a.data_agenda || "").localeCompare(String(b.data_agenda || "")));

      const ticketsHoje = ticketsComPrazo.filter((x) => String(x.due_date).slice(0, 10) === hoje);
      const ticketsSemana = ticketsComPrazo.filter((x) => {
        const d = String(x.due_date).slice(0, 10);
        return d >= hoje && d <= limite;
      });
      const ticketsAtrasados = ticketsComPrazo.filter((x) => String(x.due_date).slice(0, 10) < hoje);

      const osHoje = osAgenda.filter((x) => String(x.data_agenda).slice(0, 10) === hoje);
      const osSemana = osAgenda.filter((x) => {
        const d = String(x.data_agenda).slice(0, 10);
        return d >= hoje && d <= limite;
      });

      const agendaHoje = [
        ...ticketsHoje.map((x) => ({ tipo: "ticket", ...x })),
        ...osHoje.map((x) => ({ tipo: "os", ...x }))
      ];

      const agendaAmanha = [
        ...ticketsComPrazo
          .filter((x) => String(x.due_date).slice(0, 10) === amanha)
          .map((x) => ({ tipo: "ticket", ...x })),
        ...osAgenda
          .filter((x) => String(x.data_agenda).slice(0, 10) === amanha)
          .map((x) => ({ tipo: "os", ...x }))
      ];

      function renderAgendaLista(lista) {
        if (!lista.length) return `<div class="empty">Nenhum compromisso.</div>`;
        return `<div class="list-lines">${lista.map((item) => linha(
          fmtData(item.data_agenda || item.due_date),
          item.status ? `<span class="status-pill status-${normalizarStatus(item.status)}">${item.status}</span>` : "",
          item.tipo === "ticket"
            ? `${item.client_name || "Sem nome"} — ${item.description || "Sem descrição"}`
            : `${item.title || "Ordem de Serviço"}${item.customer_name ? " — " + item.customer_name : ""}`,
          item.tipo === "ticket" ? (item.client_phone || "Chamado") : (item.notes || "OS")
        )).join("")}</div>`;
      }

      let blocosSemana = "";
      for (let i = 0; i < 7; i++) {
        const dia = addDias(hoje, i);
        const itensDia = [
          ...ticketsComPrazo
            .filter((x) => String(x.due_date).slice(0, 10) === dia)
            .map((x) => ({ tipo: "ticket", ...x })),
          ...osAgenda
            .filter((x) => String(x.data_agenda).slice(0, 10) === dia)
            .map((x) => ({ tipo: "os", ...x }))
        ];

        blocosSemana += `
          <div class="panel">
            <h2>${new Date(dia + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}</h2>
            ${renderAgendaLista(itensDia)}
          </div>
        `;
      }

      alvo.innerHTML = `
        <div class="cards" style="grid-template-columns:repeat(4,minmax(0,1fr));">
          <div class="card"><div class="card-label">Agenda de Hoje</div><div class="card-value">${inteiro(agendaHoje.length)}</div></div>
          <div class="card"><div class="card-label">Chamados da Semana</div><div class="card-value">${inteiro(ticketsSemana.length)}</div></div>
          <div class="card"><div class="card-label">OS da Semana</div><div class="card-value">${inteiro(osSemana.length)}</div></div>
          <div class="card"><div class="card-label">Chamados Atrasados</div><div class="card-value">${inteiro(ticketsAtrasados.length)}</div></div>
        </div>

        <div class="grid-2" style="margin-top:16px;">
          ${panel("Hoje", "Chamados e ordens previstos para hoje", renderAgendaLista(agendaHoje))}
          ${panel("Amanhã", "Programação prevista para o próximo dia", renderAgendaLista(agendaAmanha))}
        </div>

        <div class="grid-2-equal" style="margin-top:16px;">
          ${blocosSemana}
        </div>
      `;
    } catch (erro) {
      setErro("Falha ao carregar agenda: " + (erro.message || erro));
      alvo.innerHTML = panel(
        "Agenda",
        "Não foi possível montar a agenda operacional.",
        `<div class="placeholder-big">Verifique os campos de data das tabelas tickets e workorders.</div>`
      );
    }
  }

  window.ModuloAgenda = {
    renderizarAgenda: renderizarAgenda
  };
})();
