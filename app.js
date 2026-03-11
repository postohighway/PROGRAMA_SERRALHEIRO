(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }

  function setErro(msg) {
    const box = $("#erroGlobal");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("show", !!msg);
  }

  function setInfo(msg) {
    const box = $("#infoGlobal");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("show", !!msg);
  }

  function setTitulo(titulo, subtitulo) {
    const t = $("#tituloTela");
    const s = $("#subtituloTela");
    if (t) t.textContent = titulo || "";
    if (s) s.textContent = subtitulo || "";
  }

  function rotaAtual() {
    const rota = (location.hash || "#dashboard").replace("#", "").trim();
    const validas = ["dashboard", "clientes", "chamados", "orcamentos", "ordens", "compras", "despesas", "financeiro", "agenda", "configuracoes"];
    return validas.includes(rota) ? rota : "dashboard";
  }

  function montarShell() {
    const app = document.getElementById("app");
    if (!app) return;

    app.innerHTML = `
      <div class="layout">
        <aside class="sidebar">
          <div class="brand-box">
            <div class="brand-title">SGB</div>
            <div class="brand-sub">Serralheria</div>
          </div>
          <nav class="nav">
            <a href="#dashboard" data-route="dashboard">Dashboard</a>
            <a href="#clientes" data-route="clientes">Clientes</a>
            <a href="#chamados" data-route="chamados">Chamados</a>
            <a href="#orcamentos" data-route="orcamentos">Orçamentos</a>
            <a href="#ordens" data-route="ordens">Ordens de Serviço</a>
            <a href="#compras" data-route="compras">Compras</a>
            <a href="#despesas" data-route="despesas">Contas a Pagar</a>
            <a href="#financeiro" data-route="financeiro">Financeiro</a>
            <a href="#agenda" data-route="agenda">Agenda</a>
            <a href="#configuracoes" data-route="configuracoes">Configurações</a>
          </nav>
        </aside>
        <main class="main">
          <div class="topbar">
            <div>
              <div class="page-title" id="tituloTela">Dashboard</div>
              <div class="hero-sub" id="subtituloTela">Visão geral do sistema</div>
            </div>
            <div class="badge-status" id="badgeConexao">Conectando...</div>
          </div>
          <div class="content">
            <div class="alert error" id="erroGlobal"></div>
            <div class="alert info" id="infoGlobal"></div>
            <div id="conteudoTela"></div>
          </div>
        </main>
      </div>
    `;

    document.querySelectorAll(".nav a").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        location.hash = a.getAttribute("data-route");
      });
    });
  }

  function atualizarBadgeConexao() {
    const badge = $("#badgeConexao");
    if (!badge) return;
    badge.textContent = window.sb && window.sb.db ? "Conectado" : "Sem conexão";
  }

  function marcarMenuAtivo() {
    const rota = rotaAtual();
    document.querySelectorAll(".nav a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("data-route") === rota);
    });
  }

  function placeholder(titulo, desc) {
    setTitulo(titulo, desc);
    $("#conteudoTela").innerHTML = `<div class="panel"><h2>${titulo}</h2><div class="panel-sub">${desc}</div><div class="placeholder-big">Módulo em preparação.</div></div>`;
  }

  async function renderizarDashboard() {
    setTitulo("Dashboard", "Visão geral do sistema");
    if (window.ModuloDashboard && typeof window.ModuloDashboard.renderizarDashboard === "function") {
      return window.ModuloDashboard.renderizarDashboard({
        areaId: "conteudoTela",
        sb: window.sb,
        setErro,
        setInfo,
        setTitulo
      });
    }

    const alvo = $("#conteudoTela");
    if (!alvo) return;
    alvo.innerHTML = `
      <div class="cards">
        <div class="card"><div class="card-label">Chamados Abertos</div><div class="card-value">0</div></div>
        <div class="card"><div class="card-label">Orçamentos Pendentes</div><div class="card-value">0</div></div>
        <div class="card"><div class="card-label">Ordens em Produção</div><div class="card-value">0</div></div>
        <div class="card"><div class="card-label">Receita do Mês</div><div class="card-value">R$ 0,00</div></div>
      </div>
    `;
  }

  async function renderizarTelaAtual() {
    setErro("");
    setInfo("");
    atualizarBadgeConexao();
    marcarMenuAtivo();

    const rota = rotaAtual();

    if (rota === "dashboard") return renderizarDashboard();

    if (rota === "chamados") {
      setTitulo("Chamados", "Controle de tickets e atendimento");
      if (window.ModuloChamados && typeof window.ModuloChamados.listarChamados === "function" && window.sb && window.sb.db && window.sb.companyId) {
        return window.ModuloChamados.listarChamados({
          areaId: "conteudoTela",
          sb: window.sb,
          companyId: window.sb.companyId,
          portalToken: window.sb.portalToken || ""
        });
      }
      return placeholder("Chamados", "Módulo de chamados não carregado.");
    }

    if (rota === "orcamentos") {
      setTitulo("Orçamentos", "Lista, edição de itens e aprovação");
      if (window.ModuloOrcamentos && typeof window.ModuloOrcamentos.listarOrcamentos === "function" && window.sb && window.sb.db && window.sb.companyId) {
        return window.ModuloOrcamentos.listarOrcamentos({
          areaId: "conteudoTela",
          sb: window.sb,
          companyId: window.sb.companyId
        });
      }
      return placeholder("Orçamentos", "Módulo de orçamentos não carregado.");
    }

    if (rota === "ordens") {
      setTitulo("Ordens de Serviço", "Produção, instalação e checklist operacional");
      if (window.ModuloOrdens && typeof window.ModuloOrdens.listarOrdens === "function" && window.sb && window.sb.db && window.sb.companyId) {
        return window.ModuloOrdens.listarOrdens({
          areaId: "conteudoTela",
          sb: window.sb,
          companyId: window.sb.companyId
        });
      }
      return placeholder("Ordens de Serviço", "Módulo de ordens não carregado.");
    }

    if (rota === "compras") {
      setTitulo("Compras", "Compras vinculadas à Ordem de Serviço e custo real");
      if (window.ModuloCompras && typeof window.ModuloCompras.listarCompras === "function" && window.sb && window.sb.db && window.sb.companyId) {
        return window.ModuloCompras.listarCompras({
          areaId: "conteudoTela",
          sb: window.sb,
          companyId: window.sb.companyId,
          workorderId: window.__osSelecionadaId || null
        });
      }
      return placeholder("Compras", "Módulo de compras não carregado.");
    }

    if (rota === "despesas") {
      setTitulo("Contas a Pagar", "Despesas administrativas e integração com fluxo de caixa");
      if (window.ModuloDespesas && typeof window.ModuloDespesas.listarDespesas === "function" && window.sb && window.sb.db && window.sb.companyId) {
        return window.ModuloDespesas.listarDespesas({
          areaId: "conteudoTela",
          sb: window.sb,
          companyId: window.sb.companyId
        });
      }
      return placeholder("Contas a Pagar", "Módulo de despesas não carregado.");
    }

    if (rota === "financeiro") {
      setTitulo("Financeiro", "Executivo, contas a receber, fluxo de caixa, DRE e previsão");
      if (window.ModuloFinanceiro && typeof window.ModuloFinanceiro.listarFinanceiro === "function" && window.sb && window.sb.db && window.sb.companyId) {
        return window.ModuloFinanceiro.listarFinanceiro({
          areaId: "conteudoTela",
          sb: window.sb,
          companyId: window.sb.companyId
        });
      }
      return placeholder("Financeiro", "Módulo financeiro não carregado.");
    }

    if (rota === "clientes") return placeholder("Clientes", "Cadastro e consulta de clientes.");
    if (rota === "agenda") return placeholder("Agenda", "Agenda operacional.");
    if (rota === "configuracoes") return placeholder("Configurações", "Ajustes do sistema.");
  }

  document.addEventListener("DOMContentLoaded", function () {
    montarShell();
    renderizarTelaAtual();
    window.addEventListener("hashchange", renderizarTelaAtual);
    setTimeout(renderizarTelaAtual, 500);
  });
})();