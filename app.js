const areaConteudo = document.getElementById("areaConteudo")
const tituloTela = document.getElementById("tituloTela")

document.querySelectorAll(".menu-item").forEach(botao=>{
botao.onclick=()=>{
carregarTela(botao.dataset.tela)
}
})

function carregarTela(tela){

if(tela==="dashboard") telaDashboard()
if(tela==="clientes") telaClientes()
if(tela==="chamados") telaChamados()
if(tela==="orcamentos") telaOrcamentos()
if(tela==="ordens") telaOrdens()
if(tela==="compras") telaCompras()
if(tela==="financeiro") telaFinanceiro()
if(tela==="agenda") telaAgenda()
if(tela==="config") telaConfig()

}

/* DASHBOARD */

function telaDashboard(){

tituloTela.innerText="Dashboard"

areaConteudo.innerHTML=`

<div class="cards">

<div class="card">
<div class="card-titulo">Chamados Abertos</div>
<div class="card-valor">0</div>
</div>

<div class="card">
<div class="card-titulo">Orçamentos Pendentes</div>
<div class="card-valor">0</div>
</div>

<div class="card">
<div class="card-titulo">Ordens em Produção</div>
<div class="card-valor">0</div>
</div>

<div class="card">
<div class="card-titulo">Receita do Mês</div>
<div class="card-valor">R$ 0</div>
</div>

</div>

`

}

/* CLIENTES */

function telaClientes(){

tituloTela.innerText="Clientes"

areaConteudo.innerHTML=`

<h3>Lista de Clientes</h3>

<button class="botao">Novo Cliente</button>

<table>

<thead>
<tr>
<th>Nome</th>
<th>Telefone</th>
<th>Email</th>
<th>Ações</th>
</tr>
</thead>

<tbody>
<tr>
<td>Exemplo</td>
<td>---</td>
<td>---</td>
<td><button class="botao">Abrir</button></td>
</tr>
</tbody>

</table>

`

}

/* CHAMADOS */

function telaChamados(){

tituloTela.innerText="Chamados"

areaConteudo.innerHTML=`

<h3>Lista de Chamados</h3>

<button class="botao">Novo Chamado</button>

<table>

<thead>
<tr>
<th>Data</th>
<th>Status</th>
<th>Prazo</th>
<th>Descrição</th>
<th>Ações</th>
</tr>
</thead>

<tbody>
<tr>
<td>-</td>
<td>Aberto</td>
<td>-</td>
<td>-</td>
<td><button class="botao">Abrir</button></td>
</tr>
</tbody>

</table>

`

}

/* ORÇAMENTOS */

function telaOrcamentos(){

tituloTela.innerText="Orçamentos"

areaConteudo.innerHTML=`<h3>Orçamentos</h3>`

}

/* ORDENS */

function telaOrdens(){

tituloTela.innerText="Ordens de Serviço"

areaConteudo.innerHTML=`<h3>Ordens de Serviço</h3>`

}

/* COMPRAS */

function telaCompras(){

tituloTela.innerText="Compras"

areaConteudo.innerHTML=`<h3>Compras</h3>`

}

/* FINANCEIRO */

function telaFinanceiro(){

tituloTela.innerText="Financeiro"

areaConteudo.innerHTML=`<h3>Financeiro</h3>`

}

/* AGENDA */

function telaAgenda(){

tituloTela.innerText="Agenda"

areaConteudo.innerHTML=`<h3>Agenda</h3>`

}

/* CONFIG */

function telaConfig(){

tituloTela.innerText="Configurações"

areaConteudo.innerHTML=`<h3>Configurações</h3>`

}

carregarTela("dashboard")
