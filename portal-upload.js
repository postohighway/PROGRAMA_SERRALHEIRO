
const urlParams = new URLSearchParams(window.location.search)

const company_id = urlParams.get("company_id")
const upload_token = urlParams.get("upload_token")

const sb = supabase.createClient(
window.sbConfig.supabaseUrl,
window.sbConfig.supabaseAnonKey
)

async function enviar(){

document.getElementById("status").innerText="Enviando..."

const payload={
p_company_id:company_id,
p_upload_token:upload_token,
p_photo1:null,
p_photo2:null,
p_photo3:null,
p_photo4:null,
p_photo5:null,
p_video1:null
}

const {data,error}=await sb.rpc(
"public_finalize_ticket_upload_via_portal",
payload
)

if(error){
document.getElementById("status").innerText="Erro: "+error.message
return
}

document.getElementById("status").innerText="Enviado com sucesso!"
}
