const areaConteudo = document.getElementById("areaConteudo");
const tituloTela = document.getElementById("tituloTela");

const estadoApp = {
  telaAtual: "dashboard",
  chamadoSelecionadoId: null
};

document.querySelectorAll(".menu-item").forEach((botao) => {
  botao.addEventListener("click", async () => {
    const tela = botao.dataset.tela;
    await carregarTela(tela);
  });
});

async function carregarTela(tela) {
  estadoApp.telaAtual = tela;

  if (tela === "dashboard") {
    await renderizarDashboard();
    return;
  }

  if (tela === "clientes") {
    renderizarTelaSimples("Clientes", "Cadastro e consulta de clientes.");
    return;
  }

  if (tela === "chamados") {
    await renderizarChamados();
    return;
  }

  if (tela === "orcamentos") {
    renderizarTelaSimples("Orçamentos", "Gestão de orçamentos.");
    return;
  }

  if (tela === "ordens") {
    renderizarTelaSimples("Ordens de Serviço", "Gestão das ordens de serviço.");
    return;
  }

  if (tela === "compras") {
    renderizarTelaSimples("Compras", "Controle de compras e materiais.");
    return;
  }

  if (tela === "financeiro") {
    renderizarTelaSimples("Financeiro", "Painel financeiro.");
    return;
  }

  if (tela === "agenda") {
    renderizarTelaSimples("Agenda", "Agenda de visitas e instalações.");
    return;
  }

  if (tela === "config") {
    renderizarTelaSimples("Configurações", "Configurações do sistema.");
    return;
  }
}

function renderizarTelaSimples(titulo, descricao) {
  tituloTela.textContent = titulo;
  areaConteudo.innerHTML = `
    <div class="painel">
      <div class="painel-cabecalho">
        <h2>${titulo}</h2>
        <p>${descricao}</p>
      </div>
      <div class="painel-corpo">
        <p>Módulo em preparação.</p>
      </div>
    </div>
  `;
}

async function renderizarDashboard() {
  tituloTela.textContent = "Dashboard";

  const resumo = {
    chamadosAbertos: 0,
    orcamentosPendentes: 0,
    ordensEmProducao: 0,
    receitaMes: 0
  };

  try {
    if (window.sb && window.sb.db && typeof window.sb.db.from === "function") {
      const hoje = new Date();
      const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;

      const [
        ticketsResp,
        quotesResp,
        workordersResp,
        receivablesResp
      ] = await Promise.all([
        window.sb.db
          .from("tickets")
          .select("id,status", { count: "exact", head: false })
          .eq("company_id", window.sb.companyId),

        window.sb.db
          .from("quotes")
          .select("id,status", { count: "exact", head: false })
          .eq("company_id", window.sb.companyId)
          .in("status", ["draft", "sent", "rascunho", "enviado"]),

        window.sb.db
          .from("workorders")
          .select("id,status", { count: "exact", head: false })
          .eq("company_id", window.sb.companyId)
          .in("status", ["aberta", "em_andamento", "producao", "produção"]),

        window.sb.db
          .from("receivables")
          .select("amount,paid,created_at")
          .eq("company_id", window.sb.companyId)
          .gte("created_at", `${inicioMes}T00:00:00`)
      ]);

      if (!ticketsResp.error) {
        resumo.chamadosAbertos = Array.isArray(ticketsResp.data)
          ? ticketsResp.data.filter((x) => ["aberto", "open", "aguardando_analise"].includes(String(x.status || "").toLowerCase())).length
          : 0;
      }

      if (!quotesResp.error) {
        resumo.orcamentosPendentes = Array.isArray(quotesResp.data) ? quotesResp.data.length : 0;
      }

      if (!workordersResp.error) {
        resumo.ordensEmProducao = Array.isArray(workordersResp.data) ? workordersResp.data.length : 0;
      }

      if (!receivablesResp.error && Array.isArray(receivablesResp.data)) {
        resumo.receitaMes = receivablesResp.data
          .filter((x) => x && x.paid)
          .reduce((acc, item) => acc + Number(item.amount || 0), 0);
      }
    }
  } catch (erro) {
    console.error("Erro ao montar dashboard:", erro);
  }

  areaConteudo.innerHTML = `
    <div class="cards">
      <div class="card">
        <div class="card-titulo">Chamados Abertos</div>
        <div class="card-valor">${resumo.chamadosAbertos}</div>
      </div>

      <div class="card">
        <div class="card-titulo">Orçamentos Pendentes</div>
        <div class="card-valor">${resumo.orcamentosPendentes}</div>
      </div>

      <div class="card">
        <div class="card-titulo">Ordens em Produção</div>
        <div class="card-valor">${resumo.ordensEmProducao}</div>
      </div>

      <div class="card">
        <div class="card-titulo">Receita do Mês</div>
        <div class="card-valor">${formatarMoeda(resumo.receitaMes)}</div>
      </div>
    </div>
  `;
}

async function renderizarChamados() {
  tituloTela.textContent = "Chamados";

  areaConteudo.innerHTML = `
    <div class="painel">
      <div class="painel-cabecalho">
        <h2>Chamados</h2>
        <p>Controle de tickets e atendimento</p>
      </div>

      <div id="chamadosArea">
        <div class="painel-corpo">Carregando módulo de chamados...</div>
      </div>
    </div>
  `;

  try {
    if (!window.ModuloChamados) {
      await carregarScriptDinamico("./chamados.js");
    }

    if (!window.ModuloChamados || typeof window.ModuloChamados.listarChamados !== "function") {
      throw new Error("Módulo de chamados não disponível.");
    }

    await window.ModuloChamados.listarChamados({
      areaId: "chamadosArea",
      companyId: window.sb?.companyId || null,
      sb: window.sb,
      onSelecionarChamado: (id) => {
        estadoApp.chamadoSelecionadoId = id;
      }
    });
  } catch (erro) {
    console.error("Erro ao carregar chamados:", erro);
    const alvo = document.getElementById("chamadosArea");
    if (alvo) {
      alvo.innerHTML = `
        <div class="erro-box">
          <strong>Falha ao carregar chamados.</strong><br>
          ${escapeHtml(erro.message || String(erro))}
        </div>
      `;
    }
  }
}

function carregarScriptDinamico(src) {
  return new Promise((resolve, reject) => {
    const existente = document.querySelector(`script[data-src="${src}"]`);
    if (existente) {
      existente.addEventListener("load", () => resolve());
      existente.addEventListener("error", () => reject(new Error(`Falha ao carregar ${src}`)));
      if (window.ModuloChamados) {
        resolve();
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.dataset.src = src;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));

    document.body.appendChild(script);
  });
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(valor || 0));
}

function escapeHtml(texto) {
  return String(texto || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("DOMContentLoaded", async () => {
  await carregarTela("dashboard");
});