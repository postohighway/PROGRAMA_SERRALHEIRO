// utils.js (SEM MODULES)
(function () {
  function uid(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function fmtMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function parseBRMoney(str) {
    if (!str) return 0;
    const cleaned = String(str)
      .replace(/[R$\s]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function monthISO(d = new Date()) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  function toISODate(v) {
    // aceita Date, timestamp, string. Retorna YYYY-MM-DD ou "".
    if (!v) return "";
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }

  function badgeForStatus(tx) {
    if (!tx || !tx.status) return "Em aberto";
    if (tx.status === "quitado") return "Quitado";
    if (tx.status === "parcial") return "Parcial";
    return "Em aberto";
  }

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return node;
  }

  window.Utils = { uid, fmtMoney, parseBRMoney, todayISO, monthISO, toISODate, badgeForStatus, qs, el };
})();
