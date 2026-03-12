
(function () {
  if (!window.ModuloChamados || !window.ModuloChamados.listarChamados) {
    console.error("ModuloChamados base não encontrado.");
    return;
  }
  const original = window.ModuloChamados.listarChamados;
  window.ModuloChamados.listarChamados = async function(ctx) {
    await original(ctx);
    const root = document.getElementById(ctx.areaId);
    if (!root) return;
    const observer = new MutationObserver(() => {
      const btn = root.querySelector("#btnGerarOrcamento");
      if (btn && !btn.dataset.pipelineHook) {
        btn.dataset.pipelineHook = "1";
        const old = btn.onclick;
        btn.addEventListener("click", async function(ev) {
          ev.preventDefault();
          ev.stopPropagation();
          const detail = root.querySelector("#detalheChamadoWrap");
          const nome = detail && detail.textContent ? detail.textContent : "";
          let ticket = null;
          const cards = root.querySelectorAll(".kanban-card[data-id]");
          for (const c of cards) {
            if (c.classList.contains("selected-ticket-card")) {
              ticket = { id: c.getAttribute("data-id") };
            }
          }
          const activeCard = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".kanban-card[data-id]") : null;
          if (!ticket && activeCard) ticket = { id: activeCard.getAttribute("data-id") };
          if (!ticket) {
            const anyCard = root.querySelector(".kanban-card[data-id]");
            if (anyCard) ticket = { id: anyCard.getAttribute("data-id") };
          }
          if (!ticket) return;
          const resp = await ctx.sb.db.from("tickets").select("*").eq("id", ticket.id).eq("company_id", ctx.companyId).maybeSingle();
          if (resp.error || !resp.data) return alert("Não foi possível localizar o ticket para gerar o orçamento.");
          if (window.ModuloBudgets && window.ModuloBudgets.abrirModalOrcamento) {
            return window.ModuloBudgets.abrirModalOrcamento(ctx, resp.data, async () => window.ModuloChamados.listarChamados(ctx));
          }
          alert("Módulo de orçamento não carregado.");
        }, true);
      }
    });
    observer.observe(root, { childList: true, subtree: True });
  };
})();
