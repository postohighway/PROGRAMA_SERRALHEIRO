(function () {
  "use strict";

  function esc(v) {
    return String(v == null ? "" : v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function fmtDate(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
  }
  function money(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
  }

  function formatarNumeroOS(os) {
    const n = Number(os && os.os_number);
    if (Number.isFinite(n) && n > 0) return `OS-${String(n).padStart(5, "0")}`;
    return os && os.id ? os.id : "—";
  }

  async function imprimirOS({ sb, workorderId }) {
    const osResp = await sb.db.from("workorders").select("*").eq("id", workorderId).single();
    if (osResp.error || !osResp.data) return alert("Erro ao carregar OS.");
    const os = osResp.data;
    const [ticketResp, quoteResp] = await Promise.all([
      os.ticket_id ? sb.db.from("tickets").select("client_name, client_phone, description, due_date").eq("id", os.ticket_id).maybeSingle() : Promise.resolve({ data: null }),
      os.quote_id ? sb.db.from("quotes").select("total, status").eq("id", os.quote_id).maybeSingle() : Promise.resolve({ data: null })
    ]);
    const ticket = ticketResp.data || null;
    const quote = quoteResp.data || null;

    const win = window.open("", "_blank", "width=980,height=760");
    if (!win) return alert("Não foi possível abrir a janela de impressão.");
    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Ordem de Serviço</title>
<style>
body{font-family:Arial,sans-serif;padding:28px;color:#111}
h1{margin:0 0 6px 0;font-size:24px}.sub{color:#555;margin-bottom:18px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
.box{border:1px solid #ccc;border-radius:8px;padding:10px}
.label{font-size:11px;color:#666;margin-bottom:4px}.value{font-size:14px;font-weight:700}
.section{margin-top:14px;border:1px solid #ccc;border-radius:8px;padding:12px}
.section h3{margin:0 0 8px 0;font-size:15px}
</style>
</head>
<body>
<h1>ORDEM DE SERVIÇO</h1>
<div class="sub">Emitida em ${esc(fmtDate(os.created_at))}</div>
<div class="grid">
  <div class="box"><div class="label">Cliente</div><div class="value">${esc(ticket?.client_name || "—")}</div></div>
  <div class="box"><div class="label">Telefone</div><div class="value">${esc(ticket?.client_phone || "—")}</div></div>
  <div class="box"><div class="label">Status</div><div class="value">${esc(os.status || "—")}</div></div>
  <div class="box"><div class="label">Orçamento</div><div class="value">${quote ? esc(money(quote.total)) : "—"}</div></div>
</div>
<div class="section"><h3>Descrição</h3>${esc(os.desc || ticket?.description || "—")}</div>
<div class="section"><h3>Vínculos</h3><div><b>OS:</b> ${esc(formatarNumeroOS(os))}</div><div><b>Ticket:</b> ${esc(os.ticket_id || "—")}</div><div><b>Orçamento:</b> ${esc(os.quote_id || "—")}</div><div><b>Prazo:</b> ${esc(fmtDate(os.due_date || ticket?.due_date))}</div></div>
<script>window.onload=function(){setTimeout(function(){window.print();},250)}<\/script>
</body></html>`);
    win.document.close();
  }

  window.PrintOS = { imprimirOS };
})();
