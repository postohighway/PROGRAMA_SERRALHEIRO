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
    const validas = ["dashboard", "clientes", "chamados", "orcamentos", "ordens", "compras", "financeiro", "agenda", "configuracoes"];
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

  function formatarMoeda(valor) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor || 0));
  }

  function formatarMesAtualInicio() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }

  async function renderizarDashboard() {
    setTitulo("Dashboard", "Visão geral do sistema");
    const alvo = $("#conteudoTela");
    if (!alvo) return;

    alvo.innerHTML = `
      <div class="cards">
        <div class="card"><div class="card-label">Chamados Abertos</div><div class="card-value">0</div></div>
        <div class="card"><div class="card-label">Orçamentos Pendentes</div><div class="card-value">0</div></div>
        <div class="card"><div class="card-label">Ordens em Produção</div><div class="card-value">0</div></div>
        <div class="card"><div class="card-label">Receita do Mês</div><div class="card-value">${formatarMoeda(0)}</div></div>
      </div>
    `;

    if (!(window.sb && window.sb.db && window.sb.companyId)) {
      setInfo("Conexão carregada, mas companyId ainda não está disponível.");
      return;
    }

    try {
      const inicioMes = formatarMesAtualInicio();

      const [ticketsResp, quotesResp, osResp, pagamentosResp] = await Promise.all([
        window.sb.db.from("tickets").select("status").eq("company_id", window.sb.companyId),
        window.sb.db.from("quotes").select("status").eq("company_id", window.sb.companyId),
        window.sb.db.from("workorders").select("status").eq("company_id", window.sb.companyId),
        window.sb.db.from("payments").select("amount, created_at").eq("company_id", window.sb.companyId).gte("created_at", `${inicioMes}T00:00:00`)
      ]);

      if (ticketsResp.error) throw ticketsResp.error;
      if (quotesResp.error) throw quotesResp.error;
      if (osResp.error) throw osResp.error;
      if (pagamentosResp.error) throw pagamentosResp.error;

      const chamadosAbertos = (ticketsResp.data || []).filter((x) => ["aberto", "open", "aguardando_analise"].includes(String(x.status || "").toLowerCase())).length;
      const orcamentosPendentes = (quotesResp.data || []).filter((x) => ["draft", "sent", "rascunho", "enviado"].includes(String(x.status || "").toLowerCase())).length;
      const ordensEmProducao = (osResp.data || []).filter((x) => ["aberta", "em_andamento", "produção", "producao"].includes(String(x.status || "").toLowerCase())).length;
      const receitaMes = (pagamentosResp.data || []).reduce((acc, item) => acc + Number(item.amount || 0), 0);

      alvo.innerHTML = `
        <div class="cards">
          <div class="card"><div class="card-label">Chamados Abertos</div><div class="card-value">${chamadosAbertos}</div></div>
          <div class="card"><div class="card-label">Orçamentos Pendentes</div><div class="card-value">${orcamentosPendentes}</div></div>
          <div class="card"><div class="card-label">Ordens em Produção</div><div class="card-value">${ordensEmProducao}</div></div>
          <div class="card"><div class="card-label">Receita do Mês</div><div class="card-value">${formatarMoeda(receitaMes)}</div></div>
        </div>
      `;
    } catch (erro) {
      setErro("Falha ao carregar dashboard: " + (erro.message || erro));
    }
  }

  function placeholder(titulo, desc) {
    setTitulo(titulo, desc);
    $("#conteudoTela").innerHTML = `<div class="panel"><h2>${titulo}</h2><div class="panel-sub">${desc}</div><div class="placeholder-big">Módulo em preparação.</div></div>`;
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

    if (rota === "clientes") return placeholder("Clientes", "Cadastro e consulta de clientes.");
    if (rota === "financeiro") return placeholder("Financeiro", "Painel financeiro.");
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