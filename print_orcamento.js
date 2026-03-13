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
  function money(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
  }
  function fmtDate(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
  }

  async function imprimirOrcamento({ sb, budgetId }) {
    const orc = await sb.db.from("budgets").select("*").eq("id", budgetId).single();
    if (orc.error || !orc.data) return alert("Erro ao carregar orçamento.");
    const itens = await sb.db.from("budget_items").select("description, quantity, unit_price, total_price").eq("budget_id", budgetId).order("sort_order", { ascending: true });
    if (itens.error) return alert("Erro ao carregar itens do orçamento.");

    const b = orc.data;
    const rows = itens.data || [];
    const win = window.open("", "_blank", "width=980,height=760");
    if (!win) return alert("Não foi possível abrir a janela de impressão.");

    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Orçamento</title>
<style>
body{font-family:Arial,sans-serif;padding:28px;color:#111}
h1{margin:0 0 6px 0;font-size:24px}.sub{color:#555;margin-bottom:18px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
.box{border:1px solid #ccc;border-radius:8px;padding:10px}
.label{font-size:11px;color:#666;margin-bottom:4px}.value{font-size:14px;font-weight:700}
table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:8px;font-size:12px;text-align:left}th{background:#f3f3f3}
.total{margin-top:16px;display:flex;justify-content:flex-end}.total .box{min-width:260px}
.obs{margin-top:16px;font-size:12px;white-space:pre-wrap}
</style>
</head>
<body>
<h1>ORÇAMENTO</h1>
<div class="sub">Emitido em ${esc(fmtDate(b.created_at))}</div>
<div class="grid">
  <div class="box"><div class="label">Cliente</div><div class="value">${esc(b.client_name || "—")}</div></div>
  <div class="box"><div class="label">Telefone</div><div class="value">${esc(b.client_phone || "—")}</div></div>
  <div class="box"><div class="label">Status</div><div class="value">${esc(b.status || "—")}</div></div>
  <div class="box"><div class="label">Versão</div><div class="value">${esc(String(b.version || 1))}</div></div>
</div>
<table>
<thead><tr><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Total</th></tr></thead>
<tbody>
${rows.length ? rows.map(r => `<tr><td>${esc(r.description)}</td><td>${esc(r.quantity)}</td><td>${esc(money(r.unit_price))}</td><td>${esc(money(r.total_price))}</td></tr>`).join("") : `<tr><td colspan="4">Nenhum item no orçamento.</td></tr>`}
</tbody>
</table>
<div class="total"><div class="box">
  <div class="label">Subtotal</div><div class="value">${esc(money(b.subtotal))}</div>
  <div class="label" style="margin-top:8px">Desconto</div><div class="value">${esc(money(b.discount_value))}</div>
  <div class="label" style="margin-top:8px">Total</div><div class="value">${esc(money(b.total))}</div>
</div></div>
<div class="obs"><b>Descrição geral:</b><br>${esc(b.description || "—")}</div>
<script>window.onload=function(){setTimeout(function(){window.print();},250)}<\/script>
</body></html>`);
    win.document.close();
  }

  window.PrintOrcamento = { imprimirOrcamento };
})();
