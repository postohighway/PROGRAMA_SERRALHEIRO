(function () {
  "use strict";

  const state = {
    tela: "dashboard",
    chamadoSelecionadoId: null,
  };

  function escapeHtml(texto) {
    return String(texto || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function formatarMoeda(valor) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor || 0));
  }
  function formatarMesAtualInicio() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }

  function montarShell() {
    const app = document.getElementById("app");
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
        const rota = a.getAttribute("data-route");
        location.hash = rota;
      });
    });
  }

  function atualizarBadgeConexao() {
    const badge = document.getElementById("badgeConexao");
    if (!badge) return;
    if (window.sb && window.sb.db) {
      badge.textContent = "Conectado";
    } else {
      badge.textContent = "Sem conexão";
    }
  }

  function setErro(msg) {
    const box = document.getElementById("erroGlobal");
    box.textContent = msg || "";
    box.classList.toggle("show", !!msg);
  }

  function setInfo(msg) {
    const box = document.getElementById("infoGlobal");
    box.textContent = msg || "";
    box.classList.toggle("show", !!msg);
  }

  function setTitulo(titulo, subtitulo) {
    document.getElementById("tituloTela").textContent = titulo;
    document.getElementById("subtituloTela").textContent = subtitulo || "";
  }

  function rotaAtual() {
    const rota = (location.hash || "#dashboard").replace("#", "").trim();
    const validas = ["dashboard", "clientes", "chamados", "orcamentos", "ordens", "compras", "financeiro", "agenda", "configuracoes"];
    return validas.includes(rota) ? rota : "dashboard";
  }

  function marcarMenuAtivo() {
    const rota = rotaAtual();
    document.querySelectorAll(".nav a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("data-route") === rota);
    });
  }

  async function renderizarTelaAtual() {
    marcarMenuAtivo();
    atualizarBadgeConexao();
    setErro("");
    setInfo("");
    state.tela = rotaAtual();

    if (state.tela === "dashboard") return renderizarDashboard();
    if (state.tela === "chamados") return renderizarChamados();
    if (state.tela === "clientes") return renderizarPlaceholder("Clientes", "Cadastro e consulta de clientes.");
    if (state.tela === "orcamentos") return renderizarPlaceholder("Orçamentos", "Gestão de orçamentos.");
    if (state.tela === "ordens") return renderizarPlaceholder("Ordens de Serviço", "Acompanhamento das ordens de serviço.");
    if (state.tela === "compras") return renderizarPlaceholder("Compras", "Controle de compras e materiais.");
    if (state.tela === "financeiro") return renderizarPlaceholder("Financeiro", "Painel financeiro em construção.");
    if (state.tela === "agenda") return renderizarPlaceholder("Agenda", "Agenda operacional.");
    if (state.tela === "configuracoes") return renderizarPlaceholder("Configurações", "Ajustes do sistema.");
  }

  async function renderizarDashboard() {
    setTitulo("Dashboard", "Visão geral do sistema");
    const alvo = document.getElementById("conteudoTela");
    alvo.innerHTML = `<div class="cards"><div class="card"><div class="card-label">Carregando...</div><div class="card-value">...</div></div></div>`;

    const resumo = {
      chamadosAbertos: 0,
      orcamentosPendentes: 0,
      ordensEmProducao: 0,
      receitaMes: 0,
    };

    try {
      if (!window.sb || !window.sb.db || !window.sb.companyId) throw new Error("Conexão ou companyId ausente.");
      const inicioMes = formatarMesAtualInicio();

      const [ticketsResp, quotesResp, osResp, pagamentosResp] = await Promise.all([
        window.sb.db.from("tickets").select("status").eq("company_id", window.sb.companyId),
        window.sb.db.from("quotes").select("status").eq("company_id", window.sb.companyId),
        window.sb.db.from("workorders").select("status").eq("company_id", window.sb.companyId),
        window.sb.db.from("payments").select("amount, paid_at, created_at").eq("company_id", window.sb.companyId).gte("created_at", `${inicioMes}T00:00:00`),
      ]);

      if (ticketsResp.error) throw ticketsResp.error;
      if (quotesResp.error) throw quotesResp.error;
      if (osResp.error) throw osResp.error;
      if (pagamentosResp.error) throw pagamentosResp.error;

      resumo.chamadosAbertos = (ticketsResp.data || []).filter((x) => ["aberto", "open", "aguardando_analise"].includes(String(x.status || "").toLowerCase())).length;
      resumo.orcamentosPendentes = (quotesResp.data || []).filter((x) => ["draft", "sent", "rascunho", "enviado"].includes(String(x.status || "").toLowerCase())).length;
      resumo.ordensEmProducao = (osResp.data || []).filter((x) => ["aberta", "em_andamento", "produção", "producao"].includes(String(x.status || "").toLowerCase())).length;
      resumo.receitaMes = (pagamentosResp.data || []).reduce((acc, item) => acc + Number(item.amount || 0), 0);
    } catch (erro) {
      setErro(`Falha ao carregar dashboard: ${erro.message || erro}`);
    }

    alvo.innerHTML = `
      <div class="cards">
        <div class="card"><div class="card-label">Chamados Abertos</div><div class="card-value">${resumo.chamadosAbertos}</div></div>
        <div class="card"><div class="card-label">Orçamentos Pendentes</div><div class="card-value">${resumo.orcamentosPendentes}</div></div>
        <div class="card"><div class="card-label">Ordens em Produção</div><div class="card-value">${resumo.ordensEmProducao}</div></div>
        <div class="card"><div class="card-label">Receita do Mês</div><div class="card-value">${formatarMoeda(resumo.receitaMes)}</div></div>
      </div>
    `;
  }

  async function renderizarChamados() {
    setTitulo("Chamados", "Controle de tickets e atendimento");
    const alvo = document.getElementById("conteudoTela");
    alvo.innerHTML = `<div class="panel"><h2>Chamados</h2><div class="panel-sub">Preparando módulo...</div></div>`;

    try {
      if (!window.ModuloChamados || typeof window.ModuloChamados.listarChamados !== "function") {
        throw new Error("Módulo de chamados não disponível.");
      }
      await window.ModuloChamados.listarChamados({
        areaId: "conteudoTela",
        sb: window.sb,
        companyId: window.sb && window.sb.companyId,
        portalToken: window.sb && window.sb.portalToken,
        onSelecionarChamado: function (id) {
          state.chamadoSelecionadoId = id;
        }
      });
    } catch (erro) {
      console.error("Erro ao carregar chamados:", erro);
      alvo.innerHTML = `
        <div class="panel">
          <h2>Chamados</h2>
          <div class="panel-sub">Controle de tickets e atendimento</div>
          <div class="alert error show">Falha ao carregar chamados.<br>${escapeHtml(erro.message || String(erro))}</div>
        </div>
      `;
    }
  }

  function renderizarPlaceholder(titulo, descricao) {
    setTitulo(titulo, "Visão geral do sistema");
    const alvo = document.getElementById("conteudoTela");
    alvo.innerHTML = `
      <div class="panel">
        <h2>${escapeHtml(titulo)}</h2>
        <div class="panel-sub">${escapeHtml(descricao)}</div>
        <div class="placeholder-big">Módulo em preparação.</div>
      </div>
    `;
  }

  document.addEventListener("DOMContentLoaded", function () {
    montarShell();
    renderizarTelaAtual();
    window.addEventListener("hashchange", renderizarTelaAtual);
  });
})();