
(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function setErro(msg) { const box = $("#erroGlobal"); if (!box) return; box.textContent = msg || ""; box.classList.toggle("show", !!msg); }
  function setInfo(msg) { const box = $("#infoGlobal"); if (!box) return; box.textContent = msg || ""; box.classList.toggle("show", !!msg); }
  function setTitulo(titulo, subtitulo) { const t = $("#tituloTela"), s = $("#subtituloTela"); if (t) t.textContent = titulo || ""; if (s) s.textContent = subtitulo || ""; }
  function rotaAtual() {
    const rota = (location.hash || "#dashboard").replace("#", "").trim();
    const validas = ["dashboard", "clientes", "chamados", "orcamentos", "pipeline", "catalogo", "ordens", "compras", "despesas", "financeiro", "agenda", "recorrencia", "configuracoes"];
    return validas.includes(rota) ? rota : "dashboard";
  }

  function montarShell() {
    const app = document.getElementById("app");
    if (!app) return;
    app.innerHTML = `<div class="layout"><aside class="sidebar"><div class="brand-box"><div class="brand-title">SGB</div><div class="brand-sub">Serralheria</div></div><nav class="nav"><a href="#dashboard" data-route="dashboard">Dashboard</a><a href="#clientes" data-route="clientes">Clientes</a><a href="#chamados" data-route="chamados">Chamados</a><a href="#orcamentos" data-route="orcamentos">Orçamentos</a><a href="#pipeline" data-route="pipeline">Pipeline Comercial</a><a href="#catalogo" data-route="catalogo">Produtos e Serviços</a><a href="#ordens" data-route="ordens">Ordens de Serviço</a><a href="#compras" data-route="compras">Compras</a><a href="#despesas" data-route="despesas">Contas a Pagar</a><a href="#financeiro" data-route="financeiro">Financeiro</a><a href="#agenda" data-route="agenda">Agenda</a><a href="#recorrencia" data-route="recorrencia">Recorrência</a><a href="#configuracoes" data-route="configuracoes">Configurações</a></nav></aside><main class="main"><div class="topbar"><div><div class="page-title" id="tituloTela">Dashboard</div><div class="hero-sub" id="subtituloTela">Visão geral do sistema</div></div><div class="badge-status" id="badgeConexao">Conectando...</div></div><div class="content"><div class="alert error" id="erroGlobal"></div><div class="alert info" id="infoGlobal"></div><div id="conteudoTela"></div></div></main></div>`;
    document.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); location.hash = a.getAttribute("data-route"); }));
  }

  function atualizarBadgeConexao() { const badge = $("#badgeConexao"); if (badge) badge.textContent = window.sb && window.sb.db ? "Conectado" : "Sem conexão"; }
  function marcarMenuAtivo() { const rota = rotaAtual(); document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("data-route") === rota)); }
  function placeholder(titulo, desc) { setTitulo(titulo, desc); $("#conteudoTela").innerHTML = `<div class="panel"><h2>${titulo}</h2><div class="panel-sub">${desc}</div><div class="placeholder-big">Módulo em preparação.</div></div>`; }
  async function renderizarDashboard() { setTitulo("Dashboard", "Visão geral do sistema"); if (window.ModuloDashboard && typeof window.ModuloDashboard.renderizarDashboard === "function") return window.ModuloDashboard.renderizarDashboard({ areaId: "conteudoTela", sb: window.sb, setErro, setInfo, setTitulo }); return placeholder("Dashboard", "Módulo não carregado."); }

  async function renderizarTelaAtual() {
    setErro(""); setInfo(""); atualizarBadgeConexao(); marcarMenuAtivo();
    const rota = rotaAtual();
    if (rota === "dashboard") return renderizarDashboard();
    if (rota === "chamados") { setTitulo("Chamados", "Controle de tickets e atendimento"); if (window.ModuloChamados && typeof window.ModuloChamados.listarChamados === "function" && window.sb && window.sb.db && window.sb.companyId) return window.ModuloChamados.listarChamados({ areaId: "conteudoTela", sb: window.sb, companyId: window.sb.companyId, portalToken: window.sb.portalToken || "" }); return placeholder("Chamados", "Módulo de chamados não carregado."); }
    if (rota === "orcamentos") { setTitulo("Orçamentos", "Orçamentos com itens de produtos e serviços"); if (window.ModuloBudgets && typeof window.ModuloBudgets.listarTelaOrcamentos === "function" && window.sb && window.sb.db && window.sb.companyId) return window.ModuloBudgets.listarTelaOrcamentos({ areaId: "conteudoTela", sb: window.sb, companyId: window.sb.companyId, setErro, setInfo, setTitulo }); return placeholder("Orçamentos", "Módulo comercial não carregado."); }
    if (rota === "pipeline") { setTitulo("Pipeline Comercial", "Fluxo comercial do chamado ao faturamento"); if (window.ModuloPipeline && typeof window.ModuloPipeline.listarPipeline === "function" && window.sb && window.sb.db && window.sb.companyId) return window.ModuloPipeline.listarPipeline({ areaId: "conteudoTela", sb: window.sb, companyId: window.sb.companyId, setErro, setInfo, setTitulo }); return placeholder("Pipeline Comercial", "Módulo de pipeline não carregado."); }
    if (rota === "catalogo") { setTitulo("Produtos e Serviços", "Cadastro mestre de preços para orçamento dinâmico"); if (window.ModuloCatalogo && typeof window.ModuloCatalogo.listarCatalogo === "function" && window.sb && window.sb.db && window.sb.companyId) return window.ModuloCatalogo.listarCatalogo({ areaId: "conteudoTela", sb: window.sb, companyId: window.sb.companyId, setErro, setInfo, setTitulo }); return placeholder("Produtos e Serviços", "Módulo de catálogo não carregado."); }
    if (rota === "ordens") { setTitulo("Ordens de Serviço", "Produção, instalação e checklist operacional"); if (window.ModuloOrdens && typeof window.ModuloOrdens.listarOrdens === "function" && window.sb && window.sb.db && window.sb.companyId) return window.ModuloOrdens.listarOrdens({ areaId: "conteudoTela", sb: window.sb, companyId: window.sb.companyId }); return placeholder("Ordens de Serviço", "Módulo de ordens não carregado."); }
    if (rota === "compras") { setTitulo("Compras", "Compras vinculadas à Ordem de Serviço e custo real"); if (window.ModuloCompras && typeof window.ModuloCompras.listarCompras === "function" && window.sb && window.sb.db && window.sb.companyId) return window.ModuloCompras.listarCompras({ areaId: "conteudoTela", sb: window.sb, companyId: window.sb.companyId, workorderId: window.__osSelecionadaId || null }); return placeholder("Compras", "Módulo de compras não carregado."); }
    if (rota === "despesas") { setTitulo("Contas a Pagar", "Despesas administrativas e integração com fluxo de caixa"); if (window.ModuloDespesas && typeof window.ModuloDespesas.listarDespesas === "function" && window.sb && window.sb.db && window.sb.companyId) return window.ModuloDespesas.listarDespesas({ areaId: "conteudoTela", sb: window.sb, companyId: window.sb.companyId }); return placeholder("Contas a Pagar", "Módulo de despesas não carregado."); }
    if (rota === "financeiro") { setTitulo("Financeiro", "Executivo, contas a receber, fluxo de caixa, DRE e previsão"); if (window.ModuloFinanceiro && typeof window.ModuloFinanceiro.listarFinanceiro === "function" && window.sb && window.sb.db && window.sb.companyId) return window.ModuloFinanceiro.listarFinanceiro({ areaId: "conteudoTela", sb: window.sb, companyId: window.sb.companyId }); return placeholder("Financeiro", "Módulo financeiro não carregado."); }
    if (rota === "agenda") { setTitulo("Agenda", "Agenda operacional da equipe"); if (window.ModuloAgenda && typeof window.ModuloAgenda.renderizarAgenda === "function") return window.ModuloAgenda.renderizarAgenda({ areaId: "conteudoTela", sb: window.sb, setErro, setInfo, setTitulo }); return placeholder("Agenda", "Módulo de agenda não carregado."); }
    if (rota === "recorrencia") { setTitulo("Recorrência", "Clientes avulsos, contratos e SLA"); if (window.ModuloRecorrencia && typeof window.ModuloRecorrencia.renderizarRecorrencia === "function") return window.ModuloRecorrencia.renderizarRecorrencia({ areaId: "conteudoTela", sb: window.sb, setErro, setInfo, setTitulo }); return placeholder("Recorrência", "Módulo de recorrência não carregado."); }
    if (rota === "clientes") return placeholder("Clientes", "Cadastro e consulta de clientes.");
    if (rota === "configuracoes") return placeholder("Configurações", "Ajustes do sistema.");
  }

  document.addEventListener("DOMContentLoaded", function () {
    montarShell();
    renderizarTelaAtual();
    window.addEventListener("hashchange", renderizarTelaAtual);
    setTimeout(renderizarTelaAtual, 500);
  });
})();
