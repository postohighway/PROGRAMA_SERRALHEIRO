(function(){

"use strict"

async function imprimirOS({sb, workorderId}){

const {data:os,error} =
await sb.db
.from("workorders")
.select("*")
.eq("id",workorderId)
.single()

if(error){
alert("Erro ao carregar OS")
return
}

const w = window.open("", "_blank")

w.document.write(`
<html>
<head>

<title>Ordem de Serviço</title>

<style>

body{
font-family:Arial;
padding:40px;
}

h1{
margin-bottom:20px;
}

.section{
margin-top:20px;
}

</style>

</head>

<body>

<h1>ORDEM DE SERVIÇO</h1>

<div class="section">
<b>Cliente:</b> ${os.client_name || ""}
</div>

<div class="section">
<b>Status:</b> ${os.status}
</div>

<div class="section">
<b>Descrição:</b><br>
${os.description || ""}
</div>

<div class="section">
<b>Data:</b>
${new Date(os.created_at).toLocaleDateString()}
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

window.PrintOS = {
imprimirOS
}

})()
