(function () {
  function formatarData(dataIso) {
    if (!dataIso) return "-";
    var data = new Date(dataIso);
    if (isNaN(data.getTime())) return String(dataIso);
    return data.toLocaleDateString("pt-BR");
  }

  function formatarDataHora(dataIso) {
    if (!dataIso) return "-";
    var data = new Date(dataIso);
    if (isNaN(data.getTime())) return String(dataIso);
    return data.toLocaleString("pt-BR");
  }

  function normalizarStatus(status) {
    var s = String(status || "").toLowerCase().trim();
    if (s === "open") return "aberto";
    if (s === "aguardando_analise") return "aguardando análise";
    if (s === "em_andamento") return "em andamento";
    if (s === "aprovado") return "aprovado";
    return s || "-";
  }

  function classeStatus(status) {
    var s = String(status || "").toLowerCase().trim();
    if (s === "aberto" || s === "open") return "status-aberto";
    if (s === "aguardando_analise") return "status-aguardando";
    if (s === "em_andamento") return "status-andamento";
    if (s === "finalizado") return "status-finalizado";
    if (s === "cancelado") return "status-cancelado";
    return "status-neutro";
  }

  async function listarChamados(sb, companyId, filtroTexto, filtroStatus) {
    var query = sb
      .from("tickets")
      .select("id, created_at, client_name, client_phone, description, status, due_date, company_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (filtroStatus && filtroStatus !== "todos") {
      query = query.eq("status", filtroStatus);
    }

    var resposta = await query;
    if (resposta.error) throw resposta.error;

    var linhas = Array.isArray(resposta.data) ? resposta.data.slice() : [];
    var texto = String(filtroTexto || "").trim().toLowerCase();
    if (texto) {
      linhas = linhas.filter(function (item) {
        return [item.client_name, item.client_phone, item.description, item.status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .indexOf(texto) >= 0;
      });
    }

    return linhas;
  }

  async function carregarDetalhe(sb, ticketId) {
    var ticketRes = await sb
      .from("tickets")
      .select("id, created_at, client_name, client_phone, description, status, due_date, photo1_path, photo2_path, photo3_path, photo4_path, photo5_path, video1_path")
      .eq("id", ticketId)
      .single();
    if (ticketRes.error) throw ticketRes.error;

    var histRes = await sb
      .from("ticket_history")
      .select("id, created_at, action, from_status, to_status, note")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false })
      .limit(50);

    var msgRes = await sb
      .from("ticket_messages")
      .select("id, created_at, author_type, author_name, message, event_type")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      ticket: ticketRes.data || null,
      historico: histRes.error ? [] : (histRes.data || []),
      mensagens: msgRes.error ? [] : (msgRes.data || [])
    };
  }

  async function criarChamado(sb, companyId, payload) {
    var insertPayload = {
      company_id: companyId,
      client_name: payload.client_name || null,
      client_phone: payload.client_phone || null,
      description: payload.description || null,
      status: payload.status || "aberto",
      due_date: payload.due_date || null,
      history: []
    };

    var resposta = await sb
      .from("tickets")
      .insert(insertPayload)
      .select("id")
      .single();

    if (resposta.error) throw resposta.error;
    return resposta.data;
  }

  window.SGBChamados = {
    formatarData: formatarData,
    formatarDataHora: formatarDataHora,
    normalizarStatus: normalizarStatus,
    classeStatus: classeStatus,
    listarChamados: listarChamados,
    carregarDetalhe: carregarDetalhe,
    criarChamado: criarChamado
  };
})();
