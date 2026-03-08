(function () {

function rotaAtual(){
  return (location.hash || "#dashboard").replace("#","");
}

function render(){

  const rota = rotaAtual()

  if(rota==="orcamentos"){
    document.getElementById("conteudoTela").innerHTML =
    '<div id="orcamentosArea"></div>';

    if(window.ModuloOrcamentos){
      window.ModuloOrcamentos.listarOrcamentos({
        areaId:"orcamentosArea",
        sb:window.sb,
        companyId:window.sb.companyId
      })
    }

    return
  }

}

document.addEventListener("DOMContentLoaded",function(){

  document.getElementById("app").innerHTML = `
  
  <div class="layout">

  <aside class="sidebar">
  <h2>SGB</h2>

  <a href="#dashboard">Dashboard</a>
  <a href="#chamados">Chamados</a>
  <a href="#orcamentos">Orçamentos</a>

  </aside>

  <main class="main">

  <div id="conteudoTela"></div>

  </main>

  </div>
  
  `

  render()

})

window.addEventListener("hashchange",render)

})()
