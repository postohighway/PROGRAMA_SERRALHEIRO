// utils.js
export function uid(prefix = "id") {
  // ID simples e único suficiente para o front (UUID-like)
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function fmtMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function parseBRMoney(str) {
  if (!str) return 0;
  // aceita "R$ 1.234,56" ou "1234,56"
  const cleaned = String(str)
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

export function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function monthISO(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export function badgeForStatus(tx) {
  // aberto | parcial | quitado
  if (!tx || !tx.status) return "aberto";
  if (tx.status === "quitado") return "Quitado";
  if (tx.status === "parcial") return "Parcial";
  return "Em aberto";
}
