(function(){

function $(s,r){return (r||document).querySelector(s)}

async function listarOrcamentos(ctx){

const area = document.getElementById(ctx.areaId)

area.innerHTML="Carregando..."

const r = await ctx.sb.db
.from("quotes")
.select("*")
.eq("company_id",ctx.companyId)
.order("created_at",{ascending:false})

if(r.error){
 area.innerHTML="Erro ao carregar"
 return
}

const data = r.data||[]

if(!data.length){
 area.innerHTML="Nenhum orçamento encontrado"
 return
}

area.innerHTML=`

<table>

<thead>
<tr>
<th>ID</th>
<th>Status</th>
<th>Total</th>
<th>Criado</th>
</tr>
</thead>

<tbody>

${data.map(o=>`

<tr>

<td>${o.id}</td>
<td>${o.status}</td>
<td>${o.total||0}</td>
<td>${new Date(o.created_at).toLocaleString()}</td>

</tr>

`).join("")}

</tbody>

</table>

`

}

window.ModuloOrcamentos={
listarOrcamentos
}

})()
