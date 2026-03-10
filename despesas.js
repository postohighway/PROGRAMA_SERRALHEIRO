
async function carregarDespesas() {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("due_date",{ascending:true});

  if(error){ console.error(error); return; }

  const tbody=document.getElementById("tabelaDespesas");
  tbody.innerHTML="";

  data.forEach(d=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td>${d.description||""}</td>
      <td>${d.category||""}</td>
      <td>${Number(d.amount||0).toFixed(2)}</td>
      <td>${d.due_date||""}</td>
      <td>${d.paid ? "Pago":"Aberto"}</td>
      <td>${!d.paid ? `<button onclick="pagarDespesa('${d.id}',${d.amount})">Baixar</button>`:""}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function criarDespesa(){
  const description=document.getElementById("desp_desc").value;
  const category=document.getElementById("desp_cat").value;
  const amount=parseFloat(document.getElementById("desp_valor").value);
  const due_date=document.getElementById("desp_venc").value;

  const {error}=await supabase.from("expenses").insert({
    description,category,amount,due_date,paid:false
  });

  if(error){alert("Erro ao criar despesa");console.error(error);return;}
  carregarDespesas();
}

async function pagarDespesa(id,valor){
  const hoje=new Date().toISOString();

  const {error}=await supabase
  .from("expenses")
  .update({paid:true,paid_at:hoje})
  .eq("id",id);

  if(error){alert("Erro ao baixar");console.error(error);return;}

  await supabase.from("txs").insert({
    type:"saida",
    amount:valor,
    origin:"expense",
    created_at:hoje
  });

  carregarDespesas();
}

document.addEventListener("DOMContentLoaded",()=>{
  if(document.getElementById("tabelaDespesas")) carregarDespesas();
});
