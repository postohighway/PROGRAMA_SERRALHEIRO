(function () {
  "use strict";

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.from((r || document).querySelectorAll(s)); }
  function esc(v) {
    return String(v == null ? "" : v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function money(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
  }
  function fmtDate(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
  }
  function fmtDateTime(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
  }
  function isoDate(v) {
    if (!v) return "";
    return String(v).slice(0, 10);
  }
  function startOfMonthISO() {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }
  function endOfMonthISO() {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  }
  function inRange(v, start, end) {
    const d = isoDate(v);
    return !!d && d >= start && d <= end;
  }
  function sum(rows, field) {
    return (rows || []).reduce((a, r) => a + Number(r && r[field] || 0), 0);
  }
  function forceDownload(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  function toCSV(rows, headers) {
    const escCSV = (v) => {
      const s = String(v == null ? "" : v).replaceAll('"', '""');
      return /[;"\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [];
    lines.push(headers.map(h => escCSV(h.label)).join(";"));
    (rows || []).forEach((row) => {
      lines.push(headers.map(h => escCSV(typeof h.value === "function" ? h.value(row) : row[h.value])).join(";"));
    });
    return "\uFEFF" + lines.join("\n");
  }

  function injectCss() {
    if (document.getElementById("css-relatorios-documentos-v1")) return;
    const st = document.createElement("style");
    st.id = "css-relatorios-documentos-v1";
    st.textContent = `
      .rel-doc-grid{display:grid;grid-template-columns:360px 1fr;gap:16px}
      .rel-doc-types{display:flex;flex-direction:column;gap:10px}
      .rel-doc-type{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;cursor:pointer}
      .rel-doc-type.active{border-color:rgba(75,135,245,.7);box-shadow:0 0 0 1px rgba(75,135,245,.25) inset;background:rgba(75,135,245,.08)}
      .rel-doc-title{font-weight:800;color:#eff6ff;margin-bottom:6px}
      .rel-doc-sub{font-size:12px;color:#9db3d6}
      .rel-doc-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .rel-doc-preview{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:14px;min-height:500px}
      .rel-doc-preview h3{margin:0 0 6px 0}
      .rel-doc-preview p{margin:0 0 12px 0;color:#9db3d6}
      .rel-doc-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
      .rel-doc-table{width:100%;border-collapse:collapse;margin-top:12px}
      .rel-doc-table th,.rel-doc-table td{padding:10px;border-bottom:1px solid rgba(108,152,232,.12);text-align:left;vertical-align:top}
      .rel-doc-table th{font-size:12px;color:#9db3d6;font-weight:700}
      .rel-doc-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
      .rel-doc-summary .item{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:10px;padding:10px}
      .rel-doc-summary .label{font-size:12px;color:#9db3d6;margin-bottom:4px}
      .rel-doc-summary .value{font-size:18px;font-weight:800;color:#eff6ff}
      .rel-doc-note{font-size:12px;color:#9db3d6;margin-top:10px}
      @media (max-width:1100px){.rel-doc-grid,.rel-doc-form,.rel-doc-summary{grid-template-columns:1fr}}
      @media print {
        body{background:#fff !important;color:#000 !important}
        .rel-print-wrap{padding:24px;font-family:Arial,sans-serif}
        .rel-print-wrap h1{font-size:22px;margin:0 0 4px 0}
        .rel-print-wrap .sub{font-size:12px;color:#444;margin-bottom:20px}
        .rel-print-wrap table{width:100%;border-collapse:collapse}
        .rel-print-wrap th,.rel-print-wrap td{border:1px solid #ccc;padding:8px;font-size:12px;text-align:left}
        .rel-print-wrap th{background:#f0f0f0}
      }
    `;
    document.head.appendChild(st);
  }

  function getValue(obj, keys, fallback) {
    for (const k of keys) {
      if (obj && obj[k] != null && obj[k] !== "") return obj[k];
    }
    return fallback == null ? "" : fallback;
  }

  async function carregarRelatorios(ctx) {
    injectCss();
    const { areaId, sb, companyId, setErro, setInfo, setTitulo } = ctx;
    if (typeof setTitulo === "function") setTitulo("Relatórios", "Documentos para impressão, fechamento do mês e conciliação");
    if (typeof setErro === "function") setErro("");
    if (typeof setInfo === "function") setInfo("Selecione o tipo de relatório, período e formato.");

    const area = document.getElementById(areaId);
    if (!area) return;

    const reportTypes = [
      { key: "recebimentos", label: "Recebimentos", sub: "Relação de recebimentos para conciliação e fechamento do mês." },
      { key: "despesas_pagas", label: "Contas pagas", sub: "Despesas quitadas no período para contabilidade." },
      { key: "compras_realizadas", label: "Compras realizadas", sub: "Compras lançadas no período, com nota e valor." },
      { key: "clientes_atendidos", label: "Clientes atendidos", sub: "Clientes com ordens concluídas no período." },
      { key: "ordens_finalizadas", label: "Ordens finalizadas", sub: "Ordens concluídas para fechamento operacional." },
      { key: "fechamento_mensal", label: "Fechamento mensal", sub: "Resumo consolidado para conferência financeira e contábil." }
    ];

    const state = {
      type: "recebimentos",
      start: startOfMonthISO(),
      end: endOfMonthISO(),
      preview: null
    };

    area.innerHTML = `
      <div class="panel">
        <div class="panel-head" style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;">
          <div>
            <h2 style="margin:0">Relatórios para impressão</h2>
            <div class="panel-sub">Use esta aba para gerar documentos de apoio à contabilidade, conciliação e fechamento do mês.</div>
          </div>
        </div>

        <div class="rel-doc-grid" style="margin-top:16px;">
          <div>
            <div class="panel" style="margin:0 0 12px 0;">
              <h3 style="margin-top:0">Tipo de relatório</h3>
              <div class="rel-doc-types" id="relDocTypes"></div>
            </div>

            <div class="panel" style="margin:0;">
              <h3 style="margin-top:0">Parâmetros</h3>
              <div class="rel-doc-form">
                <div>
                  <label class="label">Data inicial</label>
                  <input id="relDataInicial" class="field" type="date" value="${state.start}">
                </div>
                <div>
                  <label class="label">Data final</label>
                  <input id="relDataFinal" class="field" type="date" value="${state.end}">
                </div>
              </div>
              <div class="rel-doc-actions">
                <button class="btn btn-primary" id="btnGerarPreview">Gerar prévia</button>
                <button class="btn btn-secondary" id="btnImprimirRel" disabled>Imprimir / PDF</button>
                <button class="btn btn-secondary" id="btnCsvRel" disabled>Exportar CSV</button>
              </div>
              <div class="rel-doc-note">Os documentos são pensados para impressão ou exportação, sem poluir a tela com dashboards duplicados.</div>
            </div>
          </div>

          <div class="rel-doc-preview" id="relDocPreview">
            <h3>Prévia do relatório</h3>
            <p>Selecione o tipo de relatório e clique em <b>Gerar prévia</b>.</p>
          </div>
        </div>
      </div>
    `;

    const typesWrap = $("#relDocTypes", area);
    typesWrap.innerHTML = reportTypes.map((t) => `
      <div class="rel-doc-type ${t.key === state.type ? "active" : ""}" data-key="${esc(t.key)}">
        <div class="rel-doc-title">${esc(t.label)}</div>
        <div class="rel-doc-sub">${esc(t.sub)}</div>
      </div>
    `).join("");

    $$(".rel-doc-type", typesWrap).forEach((el) => {
      el.addEventListener("click", () => {
        state.type = el.getAttribute("data-key");
        $$(".rel-doc-type", typesWrap).forEach((x) => x.classList.toggle("active", x === el));
      });
    });

    $("#btnGerarPreview", area).addEventListener("click", async () => {
      state.start = $("#relDataInicial", area).value;
      state.end = $("#relDataFinal", area).value;
      if (!state.start || !state.end) {
        if (typeof setErro === "function") setErro("Informe data inicial e final.");
        return;
      }
      if (state.start > state.end) {
        if (typeof setErro === "function") setErro("A data inicial não pode ser maior que a final.");
        return;
      }
      if (typeof setErro === "function") setErro("");
      state.preview = await buildReportData(sb, companyId, state.type, state.start, state.end);
      renderPreview($("#relDocPreview", area), state.preview);
      $("#btnImprimirRel", area).disabled = false;
      $("#btnCsvRel", area).disabled = false;
    });

    $("#btnImprimirRel", area).addEventListener("click", () => {
      if (!state.preview) return;
      openPrintWindow(state.preview);
    });

    $("#btnCsvRel", area).addEventListener("click", () => {
      if (!state.preview) return;
      const csv = toCSV(state.preview.rows, state.preview.csvHeaders);
      const file = `${state.preview.slug}_${state.start}_a_${state.end}.csv`;
      forceDownload(file, csv, "text/csv;charset=utf-8");
    });
  }

  async function buildReportData(sb, companyId, type, start, end) {
    switch (type) {
      case "recebimentos":
        return await reportRecebimentos(sb, companyId, start, end);
      case "despesas_pagas":
        return await reportDespesasPagas(sb, companyId, start, end);
      case "compras_realizadas":
        return await reportCompras(sb, companyId, start, end);
      case "clientes_atendidos":
        return await reportClientesAtendidos(sb, companyId, start, end);
      case "ordens_finalizadas":
        return await reportOrdensFinalizadas(sb, companyId, start, end);
      case "fechamento_mensal":
        return await reportFechamentoMensal(sb, companyId, start, end);
      default:
        return await reportRecebimentos(sb, companyId, start, end);
    }
  }

  async function reportRecebimentos(sb, companyId, start, end) {
    const { data, error } = await sb.db
      .from("payments")
      .select("id, amount, method, paid_at, created_at, note, ticket_id, quote_id, receivable_id")
      .eq("company_id", companyId)
      .order("paid_at", { ascending: false });
    if (error) throw error;
    const rows = (data || []).filter((x) => inRange(x.paid_at || x.created_at, start, end));
    const total = rows.reduce((a, x) => a + Number(x.amount || 0), 0);
    return {
      slug: "recebimentos",
      title: "Relatório de recebimentos",
      subtitle: `Período de ${fmtDate(start)} a ${fmtDate(end)}`,
      summary: [
        { label: "Lançamentos", value: String(rows.length) },
        { label: "Total recebido", value: money(total) },
        { label: "Período", value: `${fmtDate(start)} a ${fmtDate(end)}` }
      ],
      columns: ["Data", "Método", "Valor", "Referência", "Observação"],
      rows,
      rowToCells: (r) => [fmtDate(r.paid_at || r.created_at), getValue(r, ["method"], "—"), money(r.amount), getValue(r, ["receivable_id", "quote_id", "ticket_id"], "—"), getValue(r, ["note"], "—")],
      csvHeaders: [
        { label: "Data", value: (r) => fmtDate(r.paid_at || r.created_at) },
        { label: "Método", value: "method" },
        { label: "Valor", value: (r) => Number(r.amount || 0).toFixed(2).replace(".", ",") },
        { label: "Referência", value: (r) => getValue(r, ["receivable_id", "quote_id", "ticket_id"], "") },
        { label: "Observação", value: "note" }
      ]
    };
  }

  async function reportDespesasPagas(sb, companyId, start, end) {
    const { data, error } = await sb.db
      .from("expenses")
      .select("id, description, category, amount, due_date, paid, paid_at, created_at")
      .eq("company_id", companyId)
      .eq("paid", true)
      .order("paid_at", { ascending: false });
    if (error) throw error;
    const rows = (data || []).filter((x) => inRange(x.paid_at || x.created_at || x.due_date, start, end));
    const total = rows.reduce((a, x) => a + Number(x.amount || 0), 0);
    return {
      slug: "contas_pagas",
      title: "Relatório de contas pagas",
      subtitle: `Período de ${fmtDate(start)} a ${fmtDate(end)}`,
      summary: [
        { label: "Lançamentos", value: String(rows.length) },
        { label: "Total pago", value: money(total) },
        { label: "Período", value: `${fmtDate(start)} a ${fmtDate(end)}` }
      ],
      columns: ["Data", "Descrição", "Categoria", "Valor", "Vencimento"],
      rows,
      rowToCells: (r) => [fmtDate(r.paid_at || r.created_at), getValue(r, ["description"], "—"), getValue(r, ["category"], "—"), money(r.amount), fmtDate(r.due_date)],
      csvHeaders: [
        { label: "Data", value: (r) => fmtDate(r.paid_at || r.created_at) },
        { label: "Descrição", value: "description" },
        { label: "Categoria", value: "category" },
        { label: "Valor", value: (r) => Number(r.amount || 0).toFixed(2).replace(".", ",") },
        { label: "Vencimento", value: (r) => fmtDate(r.due_date) }
      ]
    };
  }

  async function reportCompras(sb, companyId, start, end) {
    const { data, error } = await sb.db
      .from("purchases")
      .select("id, description, invoice_number, total, value, status, created_at, paid_at, workorder_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data || []).filter((x) => inRange(x.created_at || x.paid_at, start, end));
    const total = rows.reduce((a, x) => a + Number(x.total || x.value || 0), 0);
    return {
      slug: "compras_realizadas",
      title: "Relatório de compras realizadas",
      subtitle: `Período de ${fmtDate(start)} a ${fmtDate(end)}`,
      summary: [
        { label: "Compras", value: String(rows.length) },
        { label: "Valor total", value: money(total) },
        { label: "Período", value: `${fmtDate(start)} a ${fmtDate(end)}` }
      ],
      columns: ["Data", "Descrição", "NF", "Status", "Valor", "OS"],
      rows,
      rowToCells: (r) => [fmtDate(r.created_at || r.paid_at), getValue(r, ["description"], "—"), getValue(r, ["invoice_number"], "—"), getValue(r, ["status"], "—"), money(r.total || r.value), getValue(r, ["workorder_id"], "—")],
      csvHeaders: [
        { label: "Data", value: (r) => fmtDate(r.created_at || r.paid_at) },
        { label: "Descrição", value: "description" },
        { label: "NF", value: "invoice_number" },
        { label: "Status", value: "status" },
        { label: "Valor", value: (r) => Number(r.total || r.value || 0).toFixed(2).replace(".", ",") },
        { label: "OS", value: "workorder_id" }
      ]
    };
  }

  async function reportClientesAtendidos(sb, companyId, start, end) {
    const { data: osRows, error } = await sb.db
      .from("workorders")
      .select("id, client_id, ticket_id, desc, status, created_at, updated_at")
      .eq("company_id", companyId)
      .eq("status", "finalizada")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const filtered = (osRows || []).filter((x) => inRange(x.updated_at || x.created_at, start, end));
    const customerIds = [...new Set(filtered.map(x => x.client_id).filter(Boolean))];
    let customersMap = {};
    if (customerIds.length) {
      const { data: custRows, error: e2 } = await sb.db.from("customers").select("id,name,phone,email").in("id", customerIds);
      if (e2) throw e2;
      customersMap = Object.fromEntries((custRows || []).map(c => [c.id, c]));
    }
    const rows = filtered.map((o) => ({
      ...o,
      customer_name: customersMap[o.client_id]?.name || "Cliente não vinculado",
      customer_phone: customersMap[o.client_id]?.phone || "—"
    }));
    return {
      slug: "clientes_atendidos",
      title: "Relatório de clientes atendidos",
      subtitle: `Clientes com ordens finalizadas no período de ${fmtDate(start)} a ${fmtDate(end)}`,
      summary: [
        { label: "Atendimentos", value: String(rows.length) },
        { label: "Clientes únicos", value: String(new Set(rows.map(r => r.customer_name)).size) },
        { label: "Período", value: `${fmtDate(start)} a ${fmtDate(end)}` }
      ],
      columns: ["Data", "Cliente", "Telefone", "OS", "Descrição"],
      rows,
      rowToCells: (r) => [fmtDate(r.updated_at || r.created_at), r.customer_name, r.customer_phone, r.id, getValue(r, ["desc"], "—")],
      csvHeaders: [
        { label: "Data", value: (r) => fmtDate(r.updated_at || r.created_at) },
        { label: "Cliente", value: "customer_name" },
        { label: "Telefone", value: "customer_phone" },
        { label: "OS", value: "id" },
        { label: "Descrição", value: "desc" }
      ]
    };
  }

  async function reportOrdensFinalizadas(sb, companyId, start, end) {
    const { data, error } = await sb.db
      .from("workorders")
      .select("id, client_id, ticket_id, quote_id, budget_id, desc, status, created_at, updated_at")
      .eq("company_id", companyId)
      .eq("status", "finalizada")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const rows = (data || []).filter((x) => inRange(x.updated_at || x.created_at, start, end));
    const orcamentoRef = (r) => r.quote_id || r.budget_id || "—";
    return {
      slug: "ordens_finalizadas",
      title: "Relatório de ordens finalizadas",
      subtitle: `Período de ${fmtDate(start)} a ${fmtDate(end)}`,
      summary: [
        { label: "Ordens", value: String(rows.length) },
        { label: "Período", value: `${fmtDate(start)} a ${fmtDate(end)}` },
        { label: "Status", value: "Finalizadas" }
      ],
      columns: ["Data", "OS", "Ticket", "Orçamento", "Descrição"],
      rows,
      rowToCells: (r) => [fmtDate(r.updated_at || r.created_at), r.id, getValue(r, ["ticket_id"], "—"), orcamentoRef(r), getValue(r, ["desc"], "—")],
      csvHeaders: [
        { label: "Data", value: (r) => fmtDate(r.updated_at || r.created_at) },
        { label: "OS", value: "id" },
        { label: "Ticket", value: "ticket_id" },
        { label: "Orçamento", value: (r) => orcamentoRef(r) },
        { label: "Descrição", value: "desc" }
      ]
    };
  }

  async function reportFechamentoMensal(sb, companyId, start, end) {
    const [compras, despesas, receb, atend] = await Promise.all([
      reportCompras(sb, companyId, start, end),
      reportDespesasPagas(sb, companyId, start, end),
      reportRecebimentos(sb, companyId, start, end),
      reportClientesAtendidos(sb, companyId, start, end)
    ]);
    const totalCompras = compras.rows.reduce((a, x) => a + Number(x.total || x.value || 0), 0);
    const totalDespesas = despesas.rows.reduce((a, x) => a + Number(x.amount || 0), 0);
    const totalRecebimentos = receb.rows.reduce((a, x) => a + Number(x.amount || 0), 0);
    const saldo = totalRecebimentos - totalDespesas - totalCompras;
    const rows = [
      { item: "Recebimentos do período", total: totalRecebimentos, detalhe: `${receb.rows.length} lançamento(s)` },
      { item: "Compras realizadas", total: totalCompras, detalhe: `${compras.rows.length} compra(s)` },
      { item: "Despesas pagas", total: totalDespesas, detalhe: `${despesas.rows.length} despesa(s)` },
      { item: "Clientes atendidos", total: atend.rows.length, detalhe: `${new Set(atend.rows.map(r => r.customer_name)).size} cliente(s)` },
      { item: "Saldo resumido", total: saldo, detalhe: "Recebimentos - Compras - Despesas" }
    ];
    return {
      slug: "fechamento_mensal",
      title: "Relatório de fechamento mensal",
      subtitle: `Período de ${fmtDate(start)} a ${fmtDate(end)}`,
      summary: [
        { label: "Recebimentos", value: money(totalRecebimentos) },
        { label: "Saídas", value: money(totalCompras + totalDespesas) },
        { label: "Saldo", value: money(saldo) }
      ],
      columns: ["Item", "Total", "Detalhe"],
      rows,
      rowToCells: (r) => [r.item, typeof r.total === "number" ? money(r.total) : String(r.total), r.detalhe],
      csvHeaders: [
        { label: "Item", value: "item" },
        { label: "Total", value: (r) => typeof r.total === "number" ? Number(r.total).toFixed(2).replace(".", ",") : r.total },
        { label: "Detalhe", value: "detalhe" }
      ]
    };
  }

  function renderPreview(el, report) {
    el.innerHTML = `
      <h3>${esc(report.title)}</h3>
      <p>${esc(report.subtitle)}</p>
      <div class="rel-doc-summary">
        ${report.summary.map((s) => `
          <div class="item">
            <div class="label">${esc(s.label)}</div>
            <div class="value">${esc(s.value)}</div>
          </div>
        `).join("")}
      </div>
      <table class="rel-doc-table">
        <thead>
          <tr>${report.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${report.rows.length ? report.rows.map((r) => `<tr>${report.rowToCells(r).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${report.columns.length}">Nenhum registro encontrado no período.</td></tr>`}
        </tbody>
      </table>
      <div class="rel-doc-note">Use <b>Imprimir / PDF</b> para imprimir ou salvar em PDF, e <b>Exportar CSV</b> para enviar à contabilidade.</div>
    `;
  }

  function openPrintWindow(report) {
    const win = window.open("", "_blank", "width=1000,height=800");
    if (!win) return alert("Não foi possível abrir a janela de impressão.");
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${esc(report.title)}</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;color:#111}
h1{font-size:22px;margin:0 0 4px 0}.sub{font-size:12px;color:#555;margin-bottom:16px}
.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
.summary .box{border:1px solid #ccc;padding:10px;border-radius:6px}
.summary .label{font-size:11px;color:#666;margin-bottom:4px}.summary .value{font-size:18px;font-weight:700}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;font-size:12px;text-align:left;vertical-align:top}th{background:#f3f3f3}
.note{font-size:11px;color:#666;margin-top:12px}
</style>
</head>
<body>
<div class="rel-print-wrap">
<h1>${esc(report.title)}</h1>
<div class="sub">${esc(report.subtitle)}</div>
<div class="summary">${report.summary.map((s)=>`<div class="box"><div class="label">${esc(s.label)}</div><div class="value">${esc(s.value)}</div></div>`).join("")}</div>
<table><thead><tr>${report.columns.map((c)=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${report.rows.length ? report.rows.map((r)=>`<tr>${report.rowToCells(r).map((c)=>`<td>${esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${report.columns.length}">Nenhum registro encontrado no período.</td></tr>`}</tbody></table>
<div class="note">Gerado pelo SGB Serralheria em ${esc(fmtDateTime(new Date().toISOString()))}</div>
</div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); }<\/script>
</body>
</html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  window.ModuloRelatorios = { carregarRelatorios };
})();
