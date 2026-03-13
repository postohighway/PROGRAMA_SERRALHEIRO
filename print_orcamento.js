(function(){

"use strict"

async function imprimirOrcamento({sb, budgetId}){

const {data:orcamento,error} =
await sb.db
.from("budgets")
.select("*")
.eq("id",budgetId)
.single()

if(error){
alert("Erro ao carregar orçamento")
return
}

const w = window.open("", "_blank")

w.document.write(`
<html>
<head>
<title>Orçamento ${orcamento.id}</title>

<style>

body{
font-family: Arial;
padding:40px;
}

h1{
margin-bottom:10px;
}

table{
width:100%;
border-collapse:collapse;
margin-top:20px;
}

td,th{
border:1px solid #ddd;
padding:8px;
}

.total{
margin-top:20px;
font-size:18px;
font-weight:bold;
}

</style>

</head>

<body>

<h1>ORÇAMENTO</h1>

<div>
Cliente: ${orcamento.client_name || ""}
</div>

<div>
Data: ${new Date(orcamento.created_at).toLocaleDateString()}
</div>

<table>

<tr>
<th>Descrição</th>
<th>Valor</th>
</tr>

<tr>
<td>${orcamento.description || ""}</td>
<td>R$ ${Number(orcamento.total||0).toFixed(2)}</td>
</tr>

</table>

<div class="total">
Total: R$ ${Number(orcamento.total||0).toFixed(2)}
</div>

<script>
window.onload = function(){
window.print()
}
</script>

</body>
</html>
`)

w.document.close()

}

window.PrintOrcamento = {
imprimirOrcamento
}

})()
