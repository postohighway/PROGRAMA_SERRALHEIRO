(function () {
  var areaConteudo = null;
  var tituloTela = null;
  var subtituloTela = null;
  var boxMensagem = null;
  var statusConexao = null;

  var estado = {
    telaAtual: "dashboard",
    companyId: null,
    userId: null,
    conectado: false,
    chamados: {
      lista: [],
      selecionadoId: null,
      detalhe: null,
      filtroTexto: "",
      filtroStatus: "todos",
      carregando: false
    }
  };

  function $(seletor, raiz) {
    return (raiz || document).querySelector(seletor);
  }

  function escapeHtml(texto) {
    return String(texto || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function mostrarMensagem(texto, tipo) {
    if (!boxMensagem) return;
    if (!texto) {
      boxMensagem.className = "box-mensagem oculto";
      boxMensagem.innerHTML = "";
      return;
    }
    boxMensagem.className = "box-mensagem" + (tipo === "erro" ? " erro" : "");
    boxMensagem.innerHTML = escapeHtml(texto);
  }

  function atualizarTopo() {
    var usuario = $("#infoUsuario");
    var empresa = $("#infoEmpresa");
    if (usuario) usuario.textContent = estado.userId ? estado.userId.slice(0, 8) + "..." : "sem sessão";
    if (empresa) empresa.textContent = estado.companyId || "sem empresa";

    if (!statusConexao) return;
    if (estado.conectado) {
      statusConexao.className = "badge-conexao ok";
      statusConexao.textContent = "Conectado";
    } else {
      statusConexao.className = "badge-conexao erro";
      statusConexao.textContent = "Sem conexão";
    }
  }

  async function iniciarSistema() {
    areaConteudo = $("#areaConteudo");
    tituloTela = $("#tituloTela");
    subtituloTela = $("#subtituloTela");
    boxMensagem = $("#boxMensagem");
    statusConexao = $("#statusConexao");

    configurarEventosGlobais();

    try {
      if (!window.sb) {
        throw new Error("Cliente do Supabase não está disponível.");
      }

      var sessao = await window.sb.auth.getSession();
      estado.userId = sessao && sessao.data && sessao.data.session && sessao.data.session.user ? sessao.data.session.user.id : null;
      estado.companyId = (window.sbConfig && window.sbConfig.defaultCompanyId) || null;
      estado.conectado = true;
      atualizarTopo();
      await renderizarTelaAtual();
    } catch (erro) {
      estado.conectado = false;
      atualizarTopo();
      mostrarMensagem(erro.message || "Falha ao iniciar o sistema.", "erro");
      console.error(erro);
    }
  }

  function configurarEventosGlobais() {
    document.querySelectorAll(".menu-item").forEach(function (botao) {
      botao.addEventListener("click", function () {
        document.querySelectorAll(".menu-item").forEach(function (item) {
          item.classList.remove("ativo");
        });
        botao.classList.add("ativo");
        estado.telaAtual = botao.getAttribute("data-tela") || "dashboard";
        renderizarTelaAtual();
      });
    });

    var btnAtualizar = $("#btnAtualizarSistema");
    if (btnAtualizar) {
      btnAtualizar.addEventListener("click", function () {
        renderizarTelaAtual();
      });
    }
  }

  async function renderizarTelaAtual() {
    mostrarMensagem("");

    if (estado.telaAtual === "dashboard") {
      tituloTela.textContent = "Dashboard";
      subtituloTela.textContent = "Visão geral do sistema";
      await renderizarDashboard();
      return;
    }

    if (estado.telaAtual === "chamados") {
      tituloTela.textContent = "Chamados";
      subtituloTela.textContent = "Controle de tickets e atendimento";
      await renderizarChamados();
      return;
    }

    var mapa = {
      clientes: "Clientes",
      orcamentos: "Orçamentos",
      ordens: "Ordens de Serviço",
      compras: "Compras",
      financeiro: "Financeiro",
      agenda: "Agenda",
      config: "Configurações"
    };

    tituloTela.textContent = mapa[estado.telaAtual] || "Módulo";
    subtituloTela.textContent = "Módulo em construção";
    areaConteudo.innerHTML = '<div class="aviso-modulo"><strong>Este módulo será montado nas próximas etapas.</strong><div style="margin-top:8px;color:#9bb1d3">Nesta etapa, o foco está em Dashboard e Chamados conectados ao banco.</div></div>';
  }

  async function renderizarDashboard() {
    if (!estado.companyId) {
      areaConteudo.innerHTML = '<div class="aviso-modulo">Company ID não encontrado na configuração.</div>';
      return;
    }

    areaConteudo.innerHTML = '<div class="aviso-modulo">Carregando dashboard...</div>';

    try {
      var sb = window.sb;
      var companyId = estado.companyId;

      var respostaTickets = await sb.from("tickets").select("id, status", { count: "exact" }).eq("company_id", companyId);
      var respostaQuotes = await sb.from("quotes").select("id, status, total", { count: "exact" }).eq("company_id", companyId);
      var respostaOrdens = await sb.from("workorders").select("id, status", { count: "exact" }).eq("company_id", companyId);
      var respostaReceber = await sb.from("receivables").select("id, amount, paid", { count: "exact" }).eq("company_id", companyId);

      var tickets = respostaTickets.data || [];
      var quotes = respostaQuotes.data || [];
      var ordens = respostaOrdens.data || [];
      var receber = respostaReceber.data || [];

      var chamadosAbertos = tickets.filter(function (item) {
        var s = String(item.status || "").toLowerCase();
        return s === "aberto" || s === "open" || s === "aguardando_analise" || s === "em_andamento";
      }).length;

      var orcamentosPendentes = quotes.filter(function (item) {
        var s = String(item.status || "").toLowerCase();
        return s === "draft" || s === "sent" || s === "rascunho" || s === "enviado";
      }).length;

      var ordensEmProducao = ordens.filter(function (item) {
        var s = String(item.status || "").toLowerCase();
        return s !== "finalizada" && s !== "cancelada";
      }).length;

      var totalReceber = receber.reduce(function (acc, item) {
        return acc + Number(item.amount || 0);
      }, 0);

      var chamadosRecentes = tickets.slice(0, 6);
      var receberAbertos = receber.filter(function (item) {
        return !item.paid;
      }).slice(0, 8);

      areaConteudo.innerHTML = '' +
        '<div class="cards-resumo">' +
          cardResumo("Chamados Abertos", String(chamadosAbertos), "Tickets pendentes ou em análise") +
          cardResumo("Orçamentos Pendentes", String(orcamentosPendentes), "Orçamentos aguardando definição") +
          cardResumo("Ordens em Produção", String(ordensEmProducao), "Ordens de serviço em andamento") +
          cardResumo("Contas a Receber", formatarMoeda(totalReceber), "Total bruto cadastrado no banco") +
        '</div>' +
        '<div class="grade-dashboard">' +
          '<div class="card">' +
            '<div class="card-cabecalho">' +
              '<div><div class="card-titulo-principal">Chamados recentes</div><div class="card-subtitulo">Últimos registros encontrados na tabela tickets</div></div>' +
            '</div>' +
            '<div class="card-corpo">' + tabelaChamadosResumida(chamadosRecentes) + '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-cabecalho">' +
              '<div><div class="card-titulo-principal">Recebíveis em aberto</div><div class="card-subtitulo">Visão rápida do financeiro a receber</div></div>' +
            '</div>' +
            '<div class="card-corpo">' + listaReceber(receberAbertos) + '</div>' +
          '</div>' +
        '</div>';
    } catch (erro) {
      areaConteudo.innerHTML = '<div class="aviso-modulo">Falha ao carregar dashboard.</div>';
      mostrarMensagem(erro.message || "Falha ao carregar dashboard.", "erro");
      console.error(erro);
    }
  }

  function cardResumo(titulo, valor, rodape) {
    return '' +
      '<div class="card card-resumo">' +
        '<div class="card-titulo">' + escapeHtml(titulo) + '</div>' +
        '<div class="card-valor">' + escapeHtml(valor) + '</div>' +
        '<div class="card-rodape">' + escapeHtml(rodape) + '</div>' +
      '</div>';
  }

  function tabelaChamadosResumida(lista) {
    if (!lista.length) {
      return '<div class="texto-sem-registro">Nenhum chamado encontrado.</div>';
    }

    var linhas = lista.map(function (item) {
      return '<tr>' +
        '<td>' + escapeHtml(window.SGBChamados.formatarData(item.created_at)) + '</td>' +
        '<td><span class="status-pill ' + window.SGBChamados.classeStatus(item.status) + '">' + escapeHtml(window.SGBChamados.normalizarStatus(item.status)) + '</span></td>' +
        '<td>' + escapeHtml(item.description || "-") + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="tabela-wrap"><table class="table"><thead><tr><th>Data</th><th>Status</th><th>Descrição</th></tr></thead><tbody>' + linhas + '</tbody></table></div>';
  }

  function listaReceber(lista) {
    if (!lista.length) {
      return '<div class="texto-sem-registro">Nenhum recebível em aberto.</div>';
    }

    return '<div class="lista-historico">' + lista.map(function (item) {
      return '<div class="item-historico">' +
        '<div class="item-historico-topo"><strong>Recebível</strong><span>' + formatarMoeda(item.amount || 0) + '</span></div>' +
        '<div class="item-historico-texto">Status: ' + (item.paid ? 'Quitado' : 'Aberto') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  async function renderizarChamados() {
    if (!estado.companyId) {
      areaConteudo.innerHTML = '<div class="aviso-modulo">Company ID não encontrado na configuração.</div>';
      return;
    }

    areaConteudo.innerHTML = montarLayoutChamados();
    vincularEventosChamados();
    await carregarListaChamados();
  }

  function montarLayoutChamados() {
    return '' +
      '<div class="barra-acoes">' +
        '<div class="filtros-linha">' +
          '<input id="filtroTextoChamados" class="input busca" type="text" placeholder="Buscar por nome, telefone ou descrição">' +
          '<select id="filtroStatusChamados" class="select">' +
            '<option value="todos">Todos os status</option>' +
            '<option value="aberto">Aberto</option>' +
            '<option value="open">Open</option>' +
            '<option value="aguardando_analise">Aguardando análise</option>' +
            '<option value="em_andamento">Em andamento</option>' +
            '<option value="finalizado">Finalizado</option>' +
            '<option value="cancelado">Cancelado</option>' +
          '</select>' +
          '<button id="btnAplicarFiltroChamados" class="botao-secundario">Aplicar / Recarregar</button>' +
        '</div>' +
        '<div class="filtros-linha">' +
          '<button id="btnNovoChamado" class="botao-primario">Novo Chamado</button>' +
        '</div>' +
      '</div>' +
      '<div class="grade-chamados">' +
        '<div class="card">' +
          '<div class="card-cabecalho">' +
            '<div><div class="card-titulo-principal">Lista de chamados</div><div class="card-subtitulo" id="textoResumoChamados">Carregando...</div></div>' +
          '</div>' +
          '<div class="card-corpo">' +
            '<div id="listaChamadosWrap"></div>' +
          '</div>' +
        '</div>' +
        '<div class="card painel-detalhe">' +
          '<div class="card-cabecalho">' +
            '<div><div class="card-titulo-principal">Detalhe do chamado</div><div class="card-subtitulo">Selecione um ticket para visualizar</div></div>' +
          '</div>' +
          '<div class="card-corpo" id="painelDetalheChamado">' +
            '<div class="detalhe-vazio">Nenhum chamado selecionado.</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="modalNovoChamado" class="oculto"></div>';
  }

  function vincularEventosChamados() {
    $("#btnAplicarFiltroChamados").addEventListener("click", function () {
      estado.chamados.filtroTexto = $("#filtroTextoChamados").value || "";
      estado.chamados.filtroStatus = $("#filtroStatusChamados").value || "todos";
      carregarListaChamados();
    });

    $("#filtroTextoChamados").addEventListener("keydown", function (evento) {
      if (evento.key === "Enter") {
        estado.chamados.filtroTexto = evento.target.value || "";
        estado.chamados.filtroStatus = $("#filtroStatusChamados").value || "todos";
        carregarListaChamados();
      }
    });

    $("#btnNovoChamado").addEventListener("click", abrirFormularioNovoChamado);
  }

  async function carregarListaChamados() {
    var wrap = $("#listaChamadosWrap");
    var resumo = $("#textoResumoChamados");
    if (!wrap) return;

    wrap.innerHTML = '<div class="texto-sem-registro">Carregando chamados...</div>';
    if (resumo) resumo.textContent = "Buscando registros no banco";

    try {
      var lista = await window.SGBChamados.listarChamados(
        window.sb,
        estado.companyId,
        estado.chamados.filtroTexto,
        estado.chamados.filtroStatus
      );

      estado.chamados.lista = lista;
      if (resumo) resumo.textContent = lista.length + " chamado(s) encontrado(s)";
      wrap.innerHTML = renderizarTabelaChamados(lista);
      vincularCliqueTabelaChamados();

      if (estado.chamados.selecionadoId) {
        var aindaExiste = lista.some(function (item) { return item.id === estado.chamados.selecionadoId; });
        if (!aindaExiste) {
          estado.chamados.selecionadoId = null;
          estado.chamados.detalhe = null;
          $("#painelDetalheChamado").innerHTML = '<div class="detalhe-vazio">Nenhum chamado selecionado.</div>';
        }
      }
    } catch (erro) {
      wrap.innerHTML = '<div class="texto-sem-registro">Falha ao carregar chamados.</div>';
      mostrarMensagem(erro.message || "Falha ao carregar chamados.", "erro");
      console.error(erro);
    }
  }

  function renderizarTabelaChamados(lista) {
    if (!lista.length) {
      return '<div class="texto-sem-registro">Nenhum chamado encontrado com os filtros atuais.</div>';
    }

    var linhas = lista.map(function (item) {
      var selecionado = estado.chamados.selecionadoId === item.id ? ' selecionado' : '';
      return '' +
        '<tr class="linha-chamado' + selecionado + '" data-id="' + escapeHtml(item.id) + '">' +
          '<td>' + escapeHtml(window.SGBChamados.formatarData(item.created_at)) + '</td>' +
          '<td>' + escapeHtml(item.client_name || "-") + '</td>' +
          '<td>' + escapeHtml(item.client_phone || "-") + '</td>' +
          '<td><span class="status-pill ' + window.SGBChamados.classeStatus(item.status) + '">' + escapeHtml(window.SGBChamados.normalizarStatus(item.status)) + '</span></td>' +
          '<td>' + escapeHtml(window.SGBChamados.formatarData(item.due_date)) + '</td>' +
          '<td>' + escapeHtml(item.description || "-") + '</td>' +
          '<td><button class="botao-suave botao-abrir-chamado" data-id="' + escapeHtml(item.id) + '">Abrir</button></td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="tabela-wrap">' +
        '<table class="table">' +
          '<thead>' +
            '<tr>' +
              '<th>Criado</th>' +
              '<th>Cliente</th>' +
              '<th>Telefone</th>' +
              '<th>Status</th>' +
              '<th>Prazo</th>' +
              '<th>Descrição</th>' +
              '<th>Ações</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + linhas + '</tbody>' +
        '</table>' +
      '</div>';
  }

  function vincularCliqueTabelaChamados() {
    document.querySelectorAll(".linha-chamado, .botao-abrir-chamado").forEach(function (item) {
      item.addEventListener("click", function () {
        var id = item.getAttribute("data-id");
        if (id) abrirDetalheChamado(id);
      });
    });
  }

  async function abrirDetalheChamado(ticketId) {
    estado.chamados.selecionadoId = ticketId;
    var painel = $("#painelDetalheChamado");
    if (painel) painel.innerHTML = '<div class="texto-sem-registro">Carregando detalhe...</div>';

    try {
      var detalhe = await window.SGBChamados.carregarDetalhe(window.sb, ticketId);
      estado.chamados.detalhe = detalhe;
      if (painel) painel.innerHTML = renderizarDetalheChamado(detalhe);
      carregarListaChamados();
    } catch (erro) {
      if (painel) painel.innerHTML = '<div class="texto-sem-registro">Falha ao carregar detalhe.</div>';
      mostrarMensagem(erro.message || "Falha ao carregar detalhe do chamado.", "erro");
      console.error(erro);
    }
  }

  function renderizarDetalheChamado(detalhe) {
    if (!detalhe || !detalhe.ticket) {
      return '<div class="detalhe-vazio">Nenhum detalhe disponível.</div>';
    }

    var t = detalhe.ticket;
    var fotos = [t.photo1_path, t.photo2_path, t.photo3_path, t.photo4_path, t.photo5_path].filter(Boolean);

    return '' +
      '<div class="grade-detalhe">' +
        campoDetalhe('ID do chamado', t.id) +
        campoDetalhe('Status', '<span class="status-pill ' + window.SGBChamados.classeStatus(t.status) + '">' + escapeHtml(window.SGBChamados.normalizarStatus(t.status)) + '</span>') +
        campoDetalhe('Cliente', t.client_name || '-') +
        campoDetalhe('Telefone', t.client_phone || '-') +
        campoDetalhe('Data de criação', window.SGBChamados.formatarDataHora(t.created_at)) +
        campoDetalhe('Prazo', window.SGBChamados.formatarData(t.due_date)) +
        campoDetalhe('Descrição', '<div class="descricao-box">' + escapeHtml(t.description || '-') + '</div>', true) +
      '</div>' +
      '<div class="secao-titulo">Arquivos informados</div>' +
      (fotos.length || t.video1_path ? renderizarArquivos(fotos, t.video1_path) : '<div class="texto-sem-registro">Nenhuma mídia gravada neste chamado.</div>') +
      '<div class="secao-titulo">Histórico</div>' +
      (detalhe.historico.length ? renderizarHistorico(detalhe.historico) : '<div class="texto-sem-registro">Sem histórico registrado.</div>') +
      '<div class="secao-titulo">Mensagens</div>' +
      (detalhe.mensagens.length ? renderizarMensagens(detalhe.mensagens) : '<div class="texto-sem-registro">Sem mensagens registradas.</div>');
  }

  function campoDetalhe(rotulo, valor, span2) {
    return '<div class="campo-detalhe' + (span2 ? ' rotulo-cheio' : '') + '"><div class="rotulo">' + escapeHtml(rotulo) + '</div><div class="valor">' + valor + '</div></div>';
  }

  function renderizarArquivos(fotos, video) {
    var html = '<div class="lista-historico">';
    fotos.forEach(function (item, index) {
      html += '<div class="item-historico"><div class="item-historico-topo"><strong>Foto ' + (index + 1) + '</strong></div><div class="item-historico-texto">' + escapeHtml(item) + '</div></div>';
    });
    if (video) {
      html += '<div class="item-historico"><div class="item-historico-topo"><strong>Vídeo</strong></div><div class="item-historico-texto">' + escapeHtml(video) + '</div></div>';
    }
    html += '</div>';
    return html;
  }

  function renderizarHistorico(lista) {
    return '<div class="lista-historico">' + lista.map(function (item) {
      var statusTexto = [item.from_status, item.to_status].filter(Boolean).join(' → ');
      return '<div class="item-historico">' +
        '<div class="item-historico-topo"><strong>' + escapeHtml(item.action || 'evento') + '</strong><span>' + escapeHtml(window.SGBChamados.formatarDataHora(item.created_at)) + '</span></div>' +
        '<div class="item-historico-texto">' + escapeHtml(statusTexto || item.note || '-') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderizarMensagens(lista) {
    return '<div class="lista-mensagens">' + lista.map(function (item) {
      var autor = [item.author_type, item.author_name].filter(Boolean).join(' - ');
      return '<div class="item-mensagem">' +
        '<div class="item-mensagem-topo"><strong>' + escapeHtml(autor || 'Mensagem') + '</strong><span>' + escapeHtml(window.SGBChamados.formatarDataHora(item.created_at)) + '</span></div>' +
        '<div class="item-mensagem-texto">' + escapeHtml(item.message || '-') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function abrirFormularioNovoChamado() {
    areaConteudo.innerHTML = '' +
      '<div class="card">' +
        '<div class="card-cabecalho">' +
          '<div><div class="card-titulo-principal">Novo Chamado</div><div class="card-subtitulo">Cadastro manual direto na tabela tickets</div></div>' +
        '</div>' +
        '<div class="card-corpo">' +
          '<div class="form-grid">' +
            '<div><label class="rotulo">Nome do cliente</label><input id="novoClientName" class="input" type="text" placeholder="Nome do cliente"></div>' +
            '<div><label class="rotulo">Telefone</label><input id="novoClientPhone" class="input" type="text" placeholder="Telefone"></div>' +
            '<div><label class="rotulo">Status inicial</label><select id="novoStatus" class="select"><option value="aberto">Aberto</option><option value="aguardando_analise">Aguardando análise</option><option value="em_andamento">Em andamento</option></select></div>' +
            '<div><label class="rotulo">Prazo</label><input id="novoDueDate" class="input" type="date"></div>' +
            '<div class="span-2"><label class="rotulo">Descrição</label><textarea id="novoDescricao" class="textarea" placeholder="Descreva o serviço solicitado"></textarea></div>' +
          '</div>' +
          '<div class="acoes-form">' +
            '<button id="btnCancelarNovoChamado" class="botao-secundario">Cancelar</button>' +
            '<button id="btnSalvarNovoChamado" class="botao-primario">Salvar Chamado</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    $("#btnCancelarNovoChamado").addEventListener("click", function () {
      renderizarChamados();
    });

    $("#btnSalvarNovoChamado").addEventListener("click", salvarNovoChamado);
  }

  async function salvarNovoChamado() {
    try {
      var payload = {
        client_name: $("#novoClientName").value.trim(),
        client_phone: $("#novoClientPhone").value.trim(),
        description: $("#novoDescricao").value.trim(),
        status: $("#novoStatus").value,
        due_date: $("#novoDueDate").value || null
      };

      if (!payload.description) {
        mostrarMensagem("A descrição do chamado é obrigatória.", "erro");
        return;
      }

      var salvo = await window.SGBChamados.criarChamado(window.sb, estado.companyId, payload);
      mostrarMensagem("Chamado criado com sucesso.");
      estado.telaAtual = "chamados";
      document.querySelectorAll(".menu-item").forEach(function (item) {
        item.classList.toggle("ativo", item.getAttribute("data-tela") === "chamados");
      });
      await renderizarChamados();
      if (salvo && salvo.id) {
        await abrirDetalheChamado(salvo.id);
      }
    } catch (erro) {
      mostrarMensagem(erro.message || "Falha ao criar chamado.", "erro");
      console.error(erro);
    }
  }

  function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  document.addEventListener("DOMContentLoaded", iniciarSistema);
})();
