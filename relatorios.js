(function () {
  "use strict";

  function $(s, r) { return (r || document).querySelector(s); }
  function money(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
  }
  function pct(n, d) {
    if (!d) return "0,0%";
    return `${((Number(n || 0) / Number(d || 0)) * 100).toFixed(1).replace(".", ",")}%`;
  }

  async function carregarRelatorios({ areaId, sb, companyId, setErro, setInfo, setTitulo }) {
    if (typeof setTitulo === "function") {
      setTitulo("Relatórios", "Indicadores operacionais do sistema");
    }

    const area = document.getElementById(areaId);
    if (!area) return;

    area.innerHTML = `
      <div class="panel">
        <div class="panel-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;">
          <div>
            <h2 style="margin:0">Relatórios</h2>
            <div class="panel-sub">Resumo operacional e executivo do sistema.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-secondary" id="btnAtualizarRelatorios">Atualizar</button>
          </div>
        </div>

        <div class="grid-cards" style="margin-top:16px;display:grid;grid-template-columns:repeat(4,minmax(180px,1fr));gap:12px;">
          <div class="card"><div class="muted">Chamados</div><div class="kpi" id="kpiChamados">--</div></div>
          <div class="card"><div class="muted">Pipeline</div><div class="kpi" id="kpiPipeline">--</div></div>
          <div class="card"><div class="muted">Ordens</div><div class="kpi" id="kpiOrdens">--</div></div>
          <div class="card"><div class="muted">Saldo</div><div class="kpi" id="kpiSaldo">--</div></div>
        </div>

        <div class="grid-relatorios" style="display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:14px;margin-top:16px;">
          <div class="panel" style="margin:0">
            <h3 style="margin-top:0">Chamados</h3>
            <div id="relChamados">Carregando...</div>
          </div>

          <div class="panel" style="margin:0">
            <h3 style="margin-top:0">Pipeline Comercial</h3>
            <div id="relPipeline">Carregando...</div>
          </div>

          <div class="panel" style="margin:0">
            <h3 style="margin-top:0">Ordens de Serviço</h3>
            <div id="relOS">Carregando...</div>
          </div>

          <div class="panel" style="margin:0">
            <h3 style="margin-top:0">Financeiro</h3>
            <div id="relFinanceiro">Carregando...</div>
          </div>
        </div>
      </div>
    `;

    async function carregar() {
      try {
        if (typeof setErro === "function") setErro("");
        if (typeof setInfo === "function") setInfo("");

        const [
          ticketsResp,
          pipelineResp,
          budgetsResp,
          workordersResp,
          expensesResp,
          receivablesResp,
          paymentsResp
        ] = await Promise.all([
          sb.db.from("tickets").select("id,status,priority,created_at").eq("company_id", companyId),
          sb.db.from("commercial_pipeline").select("id,stage,status,estimated_value,approved_value,created_at,ticket_id").eq("company_id", companyId),
          sb.db.from("budgets").select("id,status,total,created_at,approved_at").eq("company_id", companyId),
          sb.db.from("workorders").select("id,status,created_at,ticket_id").eq("company_id", companyId),
          sb.db.from("expenses").select("id,amount,created_at").eq("company_id", companyId),
          sb.db.from("receivables").select("id,amount,paid,created_at,due_date").eq("company_id", companyId),
          sb.db.from("payments").select("id,amount,created_at,paid_at").eq("company_id", companyId)
        ]);

        if (ticketsResp.error) throw ticketsResp.error;
        if (pipelineResp.error) throw pipelineResp.error;
        if (budgetsResp.error) throw budgetsResp.error;
        if (workordersResp.error) throw workordersResp.error;
        if (expensesResp.error) throw expensesResp.error;
        if (receivablesResp.error) throw receivablesResp.error;
        if (paymentsResp.error) throw paymentsResp.error;

        const tickets = ticketsResp.data || [];
        const pipeline = pipelineResp.data || [];
        const budgets = budgetsResp.data || [];
        const workorders = workordersResp.data || [];
        const expenses = expensesResp.data || [];
        const receivables = receivablesResp.data || [];
        const payments = paymentsResp.data || [];

        const chamadosPorStatus = tickets.reduce((acc, item) => {
          const k = item.status || "sem_status";
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {});

        const prioridades = tickets.reduce((acc, item) => {
          const k = item.priority || "sem_prioridade";
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {});

        const pipelinePorEtapa = pipeline.reduce((acc, item) => {
          const k = item.stage || "sem_etapa";
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {});

        const valorEmAberto = budgets
          .filter(b => ["draft", "sent"].includes(String(b.status || "").toLowerCase()))
          .reduce((acc, b) => acc + Number(b.total || 0), 0);

        const valorAprovado = budgets
          .filter(b => ["approved", "converted"].includes(String(b.status || "").toLowerCase()))
          .reduce((acc, b) => acc + Number(b.total || 0), 0);

        const taxaConversao = pct(
          budgets.filter(b => ["approved", "converted"].includes(String(b.status || "").toLowerCase())).length,
          budgets.length
        );

        const osAbertas = workorders.filter(o => String(o.status) === "aberta").length;
        const osExecucao = workorders.filter(o => ["em_execucao", "aguardando_peca"].includes(String(o.status))).length;
        const osFinalizadas = workorders.filter(o => String(o.status) === "finalizada").length;
        const osCanceladas = workorders.filter(o => String(o.status) === "cancelada").length;

        const totalRecebiveis = receivables.reduce((acc, r) => acc + Number(r.amount || 0), 0);
        const totalRecebido = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
        const totalDespesas = expenses.reduce((acc, d) => acc + Number(d.amount || d.value || 0), 0);
        const saldo = totalRecebido - totalDespesas;

        $("#kpiChamados", area).textContent = String(tickets.length);
        $("#kpiPipeline", area).textContent = String(pipeline.length);
        $("#kpiOrdens", area).textContent = String(workorders.length);
        $("#kpiSaldo", area).textContent = money(saldo);

        $("#relChamados", area).innerHTML = `
          <div class="kv-list">
            <div>Total: <b>${tickets.length}</b></div>
            <div>Em aberto: <b>${chamadosPorStatus.aberto || 0}</b></div>
            <div>Em análise: <b>${chamadosPorStatus.em_analise || 0}</b></div>
            <div>Em andamento: <b>${chamadosPorStatus.em_andamento || 0}</b></div>
            <div>Aguardando cliente: <b>${chamadosPorStatus.aguardando_cliente || 0}</b></div>
            <div>Finalizados: <b>${chamadosPorStatus.finalizado || chamadosPorStatus.finalizados || 0}</b></div>
            <hr>
            <div>Prioridade crítica: <b>${prioridades.critica || 0}</b></div>
            <div>Prioridade alta: <b>${prioridades.alta || 0}</b></div>
          </div>
        `;

        $("#relPipeline", area).innerHTML = `
          <div class="kv-list">
            <div>Diagnóstico: <b>${pipelinePorEtapa.diagnostico || 0}</b></div>
            <div>Orçamento: <b>${pipelinePorEtapa.orcamento || 0}</b></div>
            <div>Aprovação: <b>${pipelinePorEtapa.aprovacao || 0}</b></div>
            <div>Aprovado: <b>${pipelinePorEtapa.aprovado || 0}</b></div>
            <div>Execução: <b>${pipelinePorEtapa.execucao || 0}</b></div>
            <div>Faturado: <b>${pipelinePorEtapa.faturado || 0}</b></div>
            <div>Perdido: <b>${pipelinePorEtapa.perdido || 0}</b></div>
            <hr>
            <div>Valor em aberto: <b>${money(valorEmAberto)}</b></div>
            <div>Valor aprovado: <b>${money(valorAprovado)}</b></div>
            <div>Taxa de conversão: <b>${taxaConversao}</b></div>
          </div>
        `;

        $("#relOS", area).innerHTML = `
          <div class="kv-list">
            <div>Total: <b>${workorders.length}</b></div>
            <div>Abertas: <b>${osAbertas}</b></div>
            <div>Em execução: <b>${osExecucao}</b></div>
            <div>Finalizadas: <b>${osFinalizadas}</b></div>
            <div>Canceladas: <b>${osCanceladas}</b></div>
          </div>
        `;

        $("#relFinanceiro", area).innerHTML = `
          <div class="kv-list">
            <div>Total a receber: <b>${money(totalRecebiveis)}</b></div>
            <div>Total recebido: <b>${money(totalRecebido)}</b></div>
            <div>Total despesas: <b>${money(totalDespesas)}</b></div>
            <div>Saldo: <b>${money(saldo)}</b></div>
          </div>
        `;
      } catch (err) {
        console.error(err);
        if (typeof setErro === "function") {
          setErro(`Erro ao carregar relatórios: ${err.message || err}`);
        }
      }
    }

    const btnAtualizar = $("#btnAtualizarRelatorios", area);
    if (btnAtualizar) btnAtualizar.addEventListener("click", carregar);

    await carregar();
  }

  window.ModuloRelatorios = {
    carregarRelatorios
  };
})();
