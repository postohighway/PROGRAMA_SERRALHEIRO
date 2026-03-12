
(function(){
  if(!window.ModuloChamados){ console.warn("ModuloChamados atual deve existir antes desta integração."); return; }
  const original = window.ModuloChamados.listarChamados;
  window.ModuloChamados.listarChamados = async function(ctx){
    await original(ctx);
    // integração não invasiva: intercepta botão de orçamento quando existir no detalhe
    const root = document.getElementById(ctx.areaId);
    if(!root) return;
    root.addEventListener("click", function(e){
      const btn = e.target.closest("#btnGerarOrcamento");
      if(!btn) return;
      if(!window.__ultimoChamadoSelecionadoPipeline && !window.ModuloBudgets) return;
    }, true);
  };
  window.IntegracaoPipelineChamados = {
    abrirOrcamento: function(ctx, ticket, refresh){
      if(window.ModuloBudgets && typeof window.ModuloBudgets.abrirModalOrcamento === "function"){
        return window.ModuloBudgets.abrirModalOrcamento(ctx, ticket, refresh);
      }
      alert("Módulo de orçamentos não carregado.");
    }
  };
})();
