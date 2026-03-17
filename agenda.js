(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function escapeHtml(t) {
    return String(t || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function inteiro(v) { return new Intl.NumberFormat("pt-BR").format(Number(v || 0)); }
  function normalizarStatus(s) { return String(s || "").trim().toLowerCase(); }

  function hojeStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function addDias(base, dias) {
    const d = new Date(typeof base === "string" ? base + "T00:00:00" : base);
    d.setDate(d.getDate() + dias);
    return d;
  }

  function fmtData(d) {
    if (!d) return "—";
    const x = new Date(typeof d === "string" && d.length <= 10 ? d + "T00:00:00" : d);
    return x.toLocaleDateString("pt-BR");
  }

  function fmtHora(d) {
    if (!d) return "";
    const x = new Date(d);
    return x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function fmtDataHora(d) {
    if (!d) return "—";
    const x = new Date(d);
    return x.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function ymd(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }

  function inicioDoDia(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function panel(title, subtitle, body) {
    return `<div class="panel"><h2>${title}</h2>${subtitle ? `<div class="panel-sub">${subtitle}</div>` : ""}${body}</div>`;
  }

  const CORES = { ticket: "#3d86ff", os: "#14c38e", appointment: "#a855f7" };
  const HORA_INICIO = 6;
  const HORA_FIM = 22;

  function injetarCss() {
    if (document.getElementById("css-agenda-premium")) return;
    const st = document.createElement("style");
    st.id = "css-agenda-premium";
    st.textContent = `
      .agenda-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:16px}
      .agenda-view-btn{padding:8px 14px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--text);cursor:pointer;font-weight:600}
      .agenda-view-btn.active{background:var(--primary);border-color:var(--primary);color:#fff}
      .agenda-nav{display:flex;align-items:center;gap:8px}
      .agenda-nav-btn{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--text);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center}
      .agenda-nav-btn:hover{background:var(--panel-2)}
      .agenda-title-range{font-size:18px;font-weight:800;min-width:220px;text-align:center}
      .agenda-filters{display:flex;gap:8px;flex-wrap:wrap}
      .agenda-filter-chip{padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--muted);cursor:pointer;font-size:13px}
      .agenda-filter-chip.active{background:rgba(61,134,255,.2);border-color:var(--primary);color:var(--text)}
      .agenda-cal-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel)}
      .agenda-week-grid{display:flex;flex-direction:column;min-width:800px}
      .agenda-week-header{display:grid;grid-template-columns:60px repeat(7,1fr);border-bottom:1px solid var(--line)}
      .agenda-week-header .col-time{font-size:11px;color:var(--muted);padding:8px;text-align:center}
      .agenda-week-header .col-day{font-size:12px;font-weight:700;padding:10px;text-align:center;border-left:1px solid var(--line)}
      .agenda-week-body{display:grid;grid-template-columns:60px repeat(7,1fr);grid-template-rows:repeat(16,60px)}
      .agenda-time-col{font-size:11px;color:var(--muted);padding:4px 8px;border-bottom:1px solid var(--line-soft)}
      .agenda-day-col{min-height:960px;border-left:1px solid var(--line);position:relative;grid-row:1/-1}
      .agenda-event{position:absolute;left:2px;right:2px;border-radius:6px;padding:4px 6px;font-size:11px;overflow:hidden;cursor:pointer;border-left:3px solid}
      .agenda-event:hover{opacity:.95;box-shadow:0 2px 8px rgba(0,0,0,.3)}
      .agenda-event[data-draggable="1"]{cursor:grab}
      .agenda-event[data-draggable="1"]:active{cursor:grabbing}
      .agenda-day-col.drag-over{background:rgba(61,134,255,.08)}
      .agenda-month-grid{display:grid;grid-template-columns:repeat(7,1fr);min-width:700px}
      .agenda-month-day{min-height:100px;border:1px solid var(--line-soft);padding:6px;font-size:12px}
      .agenda-month-day.other-month{background:rgba(0,0,0,.15);color:var(--muted)}
      .agenda-month-day-num{font-weight:700;margin-bottom:8px;color:var(--muted)}
      .agenda-month-day.today .agenda-month-day-num{color:var(--primary)}
      .agenda-event-month{font-size:10px;padding:2px 6px;margin-bottom:4px;border-radius:4px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-left:3px solid}
      .agenda-btn-add{padding:8px 16px;border-radius:10px;background:var(--primary);color:#fff;border:none;font-weight:600;cursor:pointer}
      .agenda-btn-add:hover{background:var(--primary-2)}
      .agenda-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px}
      .agenda-modal-box{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);max-width:420px;width:100%;padding:20px;max-height:90vh;overflow-y:auto}
      .agenda-modal h3{margin:0 0 16px 0;font-size:18px}
      .agenda-modal .field{margin-bottom:12px}
      .agenda-modal label{display:block;font-size:12px;color:var(--muted);margin-bottom:4px}
      .agenda-modal input,.agenda-modal textarea{width:100%;padding:10px;border-radius:8px;border:1px solid var(--line);background:var(--bg-soft);color:var(--text)}
      .agenda-modal-actions{display:flex;gap:10px;margin-top:20px;justify-content:flex-end}
    `;
    document.head.appendChild(st);
  }

  async function renderizarAgenda(opts) {
    const areaId = (opts && opts.areaId) || "conteudoTela";
    const sb = (opts && opts.sb) || window.sb;
    const setErro = (opts && opts.setErro) || (function () {});
    const setInfo = (opts && opts.setInfo) || (function () {});
    const setTitulo = (opts && opts.setTitulo) || (function () {});

    setTitulo("Agenda", "Calendário operacional — chamados, OS e compromissos");
    setErro("");
    setInfo("");
    injetarCss();

    const alvo = document.getElementById(areaId);
    if (!alvo) return;

    alvo.innerHTML = panel("Agenda", "Carregando...", `<div class="placeholder-big">Aguarde...</div>`);

    if (!(sb && sb.db && sb.companyId)) {
      setInfo("Conexão ou companyId não disponível.");
      return;
    }

    const state = {
      viewMode: "week",
      cursor: new Date(),
      filtroTipo: "all",
      tickets: [],
      workorders: [],
      appointments: [],
      scheduleEvents: [],
      customers: []
    };

    async function carregarDados() {
      let inicio, fim;
      if (state.viewMode === "week") {
        inicio = addDias(state.cursor, -state.cursor.getDay());
        fim = addDias(inicio, 6);
      } else {
        const primeiro = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
        const offset = (primeiro.getDay() + 6) % 7;
        inicio = addDias(primeiro, -offset);
        fim = addDias(inicio, 41);
      }

      const fimIso = fim.toISOString().slice(0, 10) + "T23:59:59.999Z";
      const inicioIso = inicio.toISOString().slice(0, 10) + "T00:00:00.000Z";

      const ticketsRes = await sb.db.from("tickets").select("id, status, due_date, client_name, description").eq("company_id", sb.companyId).then(r => r).catch(() => ({ data: [] }));
      const workordersRes = await sb.db.from("workorders").select("id, os_number, status, \"desc\", due_date, notes, client_id").eq("company_id", sb.companyId).then(r => r).catch(() => ({ data: [] }));
      const appointmentsRes = await sb.db.from("appointments").select("*").eq("company_id", sb.companyId).lte("start_at", fimIso).gte("end_at", inicioIso).then(r => r).catch(() => ({ data: [] }));
      const scheduleRes = await sb.db.from("schedule_events").select("id, ticket_id, event_type, start_at, estimated_minutes, address, notes").eq("company_id", sb.companyId).lte("start_at", fimIso).gte("start_at", inicioIso).then(r => r).catch(() => ({ data: [] }));
      const customersRes = await sb.db.from("customers").select("id, name").eq("company_id", sb.companyId).then(r => r).catch(() => ({ data: [] }));

      state.tickets = (ticketsRes.data || []).filter(t => !["finalizado", "cancelado"].includes(normalizarStatus(t.status)));
      state.workorders = (workordersRes.data || []).filter(w => !["finalizada", "cancelada"].includes(normalizarStatus(w.status)));
      state.appointments = appointmentsRes.data || [];
      state.scheduleEvents = scheduleRes.data || [];
      state.customers = customersRes.data || [];
    }

    function getCustomerName(id) {
      const c = state.customers.find(x => x.id === id);
      return c ? c.name : "";
    }

    function formatarOS(w) {
      const n = Number(w && w.os_number);
      return Number.isFinite(n) && n > 0 ? `OS-${String(n).padStart(5, "0")}` : `OS ${w?.id || "—"}`;
    }

    function eventosParaPeriodo() {
      const eventos = [];
      let inicio, fim;
      if (state.viewMode === "week") {
        inicio = addDias(state.cursor, -state.cursor.getDay());
        fim = addDias(inicio, 6);
      } else {
        const primeiro = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
        const offset = (primeiro.getDay() + 6) % 7;
        inicio = addDias(primeiro, -offset);
        fim = addDias(inicio, 41);
      }

      const filtro = (tipo) => state.filtroTipo === "all" || state.filtroTipo === tipo;

      state.tickets.forEach(t => {
        if (!t.due_date || !filtro("ticket")) return;
        const dt = new Date(t.due_date.length <= 10 ? t.due_date + "T09:00:00" : t.due_date);
        if (dt < inicio || dt > fim) return;
        eventos.push({
          tipo: "ticket",
          id: t.id,
          title: (t.client_name || "Chamado") + " — " + (t.description || "").slice(0, 40),
          start: dt,
          end: new Date(dt.getTime() + 60 * 60 * 1000),
          color: CORES.ticket,
          raw: t,
          link: "#chamados"
        });
      });

      state.workorders.forEach(w => {
        if (!w.due_date || !filtro("os")) return;
        const dt = new Date(w.due_date.length <= 10 ? w.due_date + "T09:00:00" : w.due_date);
        if (dt < inicio || dt > fim) return;
        const nome = getCustomerName(w.client_id) || "Cliente";
        eventos.push({
          tipo: "os",
          id: w.id,
          title: formatarOS(w) + " — " + (w.desc || nome).slice(0, 40),
          start: dt,
          end: new Date(dt.getTime() + 60 * 60 * 1000),
          color: CORES.os,
          raw: w,
          link: "#ordens"
        });
      });

      (state.appointments || []).forEach(a => {
        if (!filtro("appointment")) return;
        const start = new Date(a.start_at);
        const end = new Date(a.end_at);
        if (end < inicio || start > fim) return;
        eventos.push({
          tipo: "appointment",
          id: a.id,
          title: a.title || "Compromisso",
          start,
          end,
          color: a.color || CORES.appointment,
          raw: a,
          link: null,
          draggable: true
        });
      });

      (state.scheduleEvents || []).forEach(ev => {
        if (!filtro("appointment")) return;
        const start = new Date(ev.start_at);
        const min = Number(ev.estimated_minutes) || 60;
        const end = new Date(start.getTime() + min * 60 * 1000);
        if (end < inicio || start > fim) return;
        eventos.push({
          tipo: "visit",
          id: ev.id,
          title: "Visita técnica" + (ev.address ? " — " + String(ev.address).slice(0, 30) : ""),
          start,
          end,
          color: "#f6b73c",
          raw: ev,
          link: "#chamados",
          draggable: false
        });
      });

      return eventos.sort((a, b) => a.start - b.start);
    }

    function abrirModalNovoCompromisso(dataSlot) {
      const data = dataSlot ? ymd(dataSlot) : ymd(state.cursor);
      const hora = dataSlot ? (dataSlot.getHours() || 9) : 9;
      const startVal = `${data}T${String(hora).padStart(2, "0")}:00:00`;
      const endVal = `${data}T${String(hora + 1).padStart(2, "0")}:00:00`;

      const modal = document.createElement("div");
      modal.className = "agenda-modal";
      modal.innerHTML = `
        <div class="agenda-modal-box">
          <h3>Novo compromisso</h3>
          <div class="field">
            <label>Título</label>
            <input id="aptTitle" class="field" placeholder="Ex: Reunião com cliente" value="">
          </div>
          <div class="field">
            <label>Descrição</label>
            <textarea id="aptDesc" rows="2" placeholder="Observações"></textarea>
          </div>
          <div class="field">
            <label>Início</label>
            <input type="datetime-local" id="aptStart" value="${startVal.slice(0, 16)}">
          </div>
          <div class="field">
            <label>Fim</label>
            <input type="datetime-local" id="aptEnd" value="${endVal.slice(0, 16)}">
          </div>
          <div class="agenda-modal-actions">
            <button type="button" class="btn" id="aptCancel">Cancelar</button>
            <button type="button" class="btn agenda-btn-add" id="aptSave">Salvar</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const fechar = () => { modal.remove(); };

      $("#aptCancel", modal).addEventListener("click", fechar);
      $("#aptSave", modal).addEventListener("click", async () => {
        const title = $("#aptTitle", modal).value.trim();
        if (!title) { alert("Informe o título."); return; }
        const start = $("#aptStart", modal).value;
        const end = $("#aptEnd", modal).value;
        if (!start || !end || new Date(end) <= new Date(start)) {
          alert("Data/hora inválida.");
          return;
        }
        const ins = await sb.db.from("appointments").insert({
          company_id: sb.companyId,
          title,
          description: $("#aptDesc", modal).value.trim() || null,
          start_at: new Date(start).toISOString(),
          end_at: new Date(end).toISOString(),
          color: CORES.appointment
        });
        if (ins.error) {
          const msg = (ins.error.message || "").toLowerCase();
          alert(msg.includes("does not exist") || msg.includes("não existe")
            ? "Execute o script sql_agenda_premium.sql no Supabase para habilitar compromissos manuais."
            : "Erro ao salvar: " + (ins.error.message || ins.error));
          return;
        }
        fechar();
        await carregarDados();
        render();
      });
      modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });
    }

    function abrirModalEditarCompromisso(id) {
      const apt = state.appointments.find(a => a.id === id);
      if (!apt) return;
      const start = new Date(apt.start_at);
      const end = new Date(apt.end_at);
      const startVal = start.toISOString().slice(0, 16);
      const endVal = end.toISOString().slice(0, 16);

      const modal = document.createElement("div");
      modal.className = "agenda-modal";
      modal.innerHTML = `
        <div class="agenda-modal-box">
          <h3>Compromisso</h3>
          <div class="field">
            <label>Título</label>
            <input id="aptTitle" class="field" value="${escapeHtml(apt.title || "")}">
          </div>
          <div class="field">
            <label>Descrição</label>
            <textarea id="aptDesc" rows="2">${escapeHtml(apt.description || "")}</textarea>
          </div>
          <div class="field">
            <label>Início</label>
            <input type="datetime-local" id="aptStart" value="${startVal}">
          </div>
          <div class="field">
            <label>Fim</label>
            <input type="datetime-local" id="aptEnd" value="${endVal}">
          </div>
          <div class="agenda-modal-actions">
            <button type="button" class="btn" style="background:var(--danger);color:#fff" id="aptDelete">Excluir</button>
            <button type="button" class="btn" id="aptCancel">Cancelar</button>
            <button type="button" class="btn agenda-btn-add" id="aptSave">Salvar</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const fechar = () => { modal.remove(); };

      $("#aptCancel", modal).addEventListener("click", fechar);
      $("#aptDelete", modal).addEventListener("click", async () => {
        if (!confirm("Excluir este compromisso?")) return;
        const del = await sb.db.from("appointments").delete().eq("id", id).eq("company_id", sb.companyId);
        if (del.error) { alert("Erro ao excluir: " + (del.error.message || del.error)); return; }
        fechar();
        await carregarDados();
        render();
      });
      $("#aptSave", modal).addEventListener("click", async () => {
        const title = $("#aptTitle", modal).value.trim();
        if (!title) { alert("Informe o título."); return; }
        const start = $("#aptStart", modal).value;
        const end = $("#aptEnd", modal).value;
        if (!start || !end || new Date(end) <= new Date(start)) {
          alert("Data/hora inválida.");
          return;
        }
        const upd = await sb.db.from("appointments").update({
          title,
          description: $("#aptDesc", modal).value.trim() || null,
          start_at: new Date(start).toISOString(),
          end_at: new Date(end).toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", id).eq("company_id", sb.companyId);
        if (upd.error) { alert("Erro ao salvar: " + (upd.error.message || upd.error)); return; }
        fechar();
        await carregarDados();
        render();
      });
      modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });
    }

    function render() {
      const eventos = eventosParaPeriodo();
      let inicio;
      if (state.viewMode === "week") {
        inicio = addDias(state.cursor, -state.cursor.getDay());
      } else {
        const primeiro = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
        const offset = (primeiro.getDay() + 6) % 7;
        inicio = addDias(primeiro, -offset);
      }
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      let calHtml = "";
      if (state.viewMode === "week") {
        const dias = [];
        for (let i = 0; i < 7; i++) dias.push(addDias(inicio, i));

        const timeLabels = Array.from({ length: HORA_FIM - HORA_INICIO }, (_, i) => {
          const h = HORA_INICIO + i;
          return `<div class="agenda-time-col" style="grid-column:1;grid-row:${i + 1}">${String(h).padStart(2, "0")}:00</div>`;
        }).join("");
        const dayCols = dias.map((dia, colIdx) => {
          const evts = eventos.filter(e => ymd(e.start) === ymd(dia));
          const slots = evts.map(ev => {
            const topPct = ((ev.start.getHours() - HORA_INICIO) * 60 + ev.start.getMinutes()) / 60 * 100 / (HORA_FIM - HORA_INICIO);
            const heightPct = Math.max(4, (ev.end - ev.start) / (60 * 60 * 1000) * 100 / (HORA_FIM - HORA_INICIO));
            return `<div class="agenda-event" style="top:${topPct}%;height:${heightPct}%;background:${ev.color}22;border-left-color:${ev.color}" data-tipo="${ev.tipo}" data-id="${ev.id}" data-draggable="${ev.draggable ? "1" : "0"}">${escapeHtml(ev.title)}</div>`;
          });
          return `<div class="agenda-day-col" style="grid-column:${colIdx + 2};grid-row:1/-1" data-date="${ymd(dia)}" data-col="${colIdx}">${slots.join("")}</div>`;
        }).join("");
        calHtml = `
          <div class="agenda-week-header">
            <div class="col-time"></div>
            ${dias.map(d => `<div class="col-day">${d.toLocaleDateString("pt-BR", { weekday: "short" })} ${d.getDate()}/${d.getMonth() + 1}</div>`).join("")}
          </div>
          <div class="agenda-week-body">
            ${timeLabels}
            ${dayCols}
          </div>
        `;
      } else {
        const dias = [];
        for (let i = 0; i < 42; i++) dias.push(addDias(inicio, i));

        const mesAtual = state.cursor.getMonth();
        calHtml = `
          <div class="agenda-week-header" style="grid-template-columns:repeat(7,1fr)">
            ${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => `<div class="col-day">${d}</div>`).join("")}
          </div>
          <div class="agenda-month-grid">
            ${dias.map(d => {
              const isOther = d.getMonth() !== mesAtual;
              const evts = eventos.filter(e => ymd(e.start) === ymd(d));
              const isToday = ymd(d) === ymd(hoje);
              return `
                <div class="agenda-month-day ${isOther ? "other-month" : ""} ${isToday ? "today" : ""}" data-date="${ymd(d)}">
                  <div class="agenda-month-day-num">${d.getDate()}</div>
                  ${evts.slice(0, 5).map(ev => `<div class="agenda-event-month" style="background:${ev.color}22;border-left-color:${ev.color}" data-tipo="${ev.tipo}" data-id="${ev.id}">${escapeHtml(ev.title)}</div>`).join("")}
                  ${evts.length > 5 ? `<div class="muted" style="font-size:10px">+${evts.length - 5} mais</div>` : ""}
                </div>
              `;
            }).join("")}
          </div>
        `;
      }

      const kpis = {
        hoje: eventos.filter(e => ymd(e.start) === hojeStr()).length,
        semana: eventos.filter(e => {
          const d = e.start;
          return d >= inicio && d <= addDias(inicio, 6);
        }).length,
        atrasados: state.tickets.filter(t => t.due_date && ymd(t.due_date) < hojeStr()).length
      };

      alvo.innerHTML = `
        <div class="cards" style="grid-template-columns:repeat(4,minmax(0,1fr));">
          <div class="card"><div class="card-label">Hoje</div><div class="card-value">${inteiro(kpis.hoje)}</div></div>
          <div class="card"><div class="card-label">Esta semana</div><div class="card-value">${inteiro(kpis.semana)}</div></div>
          <div class="card"><div class="card-label">Chamados atrasados</div><div class="card-value">${inteiro(kpis.atrasados)}</div></div>
          <div class="card"><div class="card-label">Compromissos</div><div class="card-value">${inteiro(state.appointments.length)}</div></div>
        </div>

        <div class="agenda-toolbar" style="margin-top:16px">
          <div class="agenda-nav">
            <button type="button" class="agenda-nav-btn" id="agendaPrev">‹</button>
            <span class="agenda-title-range" id="agendaRange">${state.viewMode === "week"
          ? `${inicio.toLocaleDateString("pt-BR")} – ${addDias(inicio, 6).toLocaleDateString("pt-BR")}`
          : state.cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
            <button type="button" class="agenda-nav-btn" id="agendaNext">›</button>
            <button type="button" class="agenda-nav-btn" id="agendaToday">Hoje</button>
          </div>
          <div class="agenda-filters">
            <button type="button" class="agenda-view-btn ${state.viewMode === "week" ? "active" : ""}" data-view="week">Semana</button>
            <button type="button" class="agenda-view-btn ${state.viewMode === "month" ? "active" : ""}" data-view="month">Mês</button>
          </div>
          <div class="agenda-filters">
            <span class="agenda-filter-chip ${state.filtroTipo === "all" ? "active" : ""}" data-filtro="all">Todos</span>
            <span class="agenda-filter-chip ${state.filtroTipo === "ticket" ? "active" : ""}" data-filtro="ticket">Chamados</span>
            <span class="agenda-filter-chip ${state.filtroTipo === "os" ? "active" : ""}" data-filtro="os">OS</span>
            <span class="agenda-filter-chip ${state.filtroTipo === "appointment" ? "active" : ""}" data-filtro="appointment">Compromissos</span>
          </div>
          <button type="button" class="agenda-btn-add" id="agendaAdd">+ Novo compromisso</button>
        </div>

        <div class="agenda-cal-wrap" style="margin-top:16px">
          <div class="agenda-week-grid">${calHtml}</div>
        </div>
      `;

      $("#agendaPrev").addEventListener("click", () => {
        state.cursor = addDias(state.cursor, state.viewMode === "week" ? -7 : -30);
        render();
      });
      $("#agendaNext").addEventListener("click", () => {
        state.cursor = addDias(state.cursor, state.viewMode === "week" ? 7 : 30);
        render();
      });
      $("#agendaToday").addEventListener("click", () => {
        state.cursor = new Date();
        render();
      });
      $$(".agenda-view-btn", alvo).forEach(btn => {
        btn.addEventListener("click", () => {
          state.viewMode = btn.getAttribute("data-view");
          render();
        });
      });
      $$(".agenda-filter-chip", alvo).forEach(chip => {
        chip.addEventListener("click", () => {
          state.filtroTipo = chip.getAttribute("data-filtro");
          render();
        });
      });
      $("#agendaAdd").addEventListener("click", () => abrirModalNovoCompromisso(null));

      $$(".agenda-event, .agenda-event-month", alvo).forEach(el => {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const tipo = el.getAttribute("data-tipo");
          const id = el.getAttribute("data-id");
          if (tipo === "ticket") location.hash = "chamados";
          else if (tipo === "os") location.hash = "ordens";
          else if (tipo === "visit") location.hash = "chamados";
          else if (tipo === "appointment") abrirModalEditarCompromisso(id);
        });
      });

      $$(".agenda-day-col", alvo).forEach(cell => {
        cell.addEventListener("dblclick", (e) => {
          if (e.target.classList.contains("agenda-event")) return;
          const dateStr = cell.getAttribute("data-date");
          if (dateStr) abrirModalNovoCompromisso(new Date(dateStr + "T09:00:00"));
        });
      });
      $$(".agenda-month-day", alvo).forEach(cell => {
        cell.addEventListener("dblclick", (e) => {
          if (e.target.classList.contains("agenda-event-month")) return;
          const dateStr = cell.getAttribute("data-date");
          if (dateStr) abrirModalNovoCompromisso(new Date(dateStr + "T09:00:00"));
        });
      });

      $$(".agenda-event[data-draggable='1']", alvo).forEach(el => {
        el.setAttribute("draggable", "true");
        el.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/plain", el.getAttribute("data-id"));
          e.dataTransfer.effectAllowed = "move";
        });
      });
      $$(".agenda-day-col", alvo).forEach(cell => {
        cell.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          cell.classList.add("drag-over");
        });
        cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"));
        cell.addEventListener("drop", async (e) => {
          e.preventDefault();
          cell.classList.remove("drag-over");
          const id = e.dataTransfer.getData("text/plain");
          if (!id) return;
          const apt = state.appointments.find(a => a.id === id);
          if (!apt) return;
          const dateStr = cell.getAttribute("data-date");
          if (!dateStr) return;
          const rect = cell.getBoundingClientRect();
          const y = e.clientY - rect.top;
          const hora = Math.floor(HORA_INICIO + (y / rect.height) * (HORA_FIM - HORA_INICIO));
          const novaHora = Math.max(0, Math.min(23, hora));
          const start = new Date(dateStr + "T" + String(novaHora).padStart(2, "0") + ":00:00");
          const dur = new Date(apt.end_at) - new Date(apt.start_at);
          const end = new Date(start.getTime() + dur);
          const upd = await sb.db.from("appointments").update({
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            updated_at: new Date().toISOString()
          }).eq("id", id).eq("company_id", sb.companyId);
          if (!upd.error) { await carregarDados(); render(); }
        });
      });
    }

    try {
      await carregarDados();
      render();
    } catch (erro) {
      setErro("Falha ao carregar agenda: " + (erro.message || erro));
      alvo.innerHTML = panel("Agenda", "Erro", `<div class="placeholder-big">Verifique a conexão e as tabelas tickets, workorders e appointments.</div>`);
    }
  }

  window.ModuloAgenda = { renderizarAgenda };
})();
