window.TicketPortal = {
  getParam(name){
    return new URLSearchParams(location.search).get(name);
  },

  async submit(){
    const companyId = this.getParam("c");
    const portalToken = this.getParam("t");

    const name = document.getElementById("clientName").value;
    const phone = document.getElementById("clientPhone").value;
    const desc = document.getElementById("description").value;

    const r = await sb.rpc("public_create_ticket_via_portal",{
      p_company_id: companyId,
      p_portal_token: portalToken,
      p_client_name: name,
      p_client_phone: phone,
      p_description: desc,
      p_due_date: null
    });

    if(r.error){
      alert("Erro ao criar ticket");
      return;
    }

    document.getElementById("msg").innerText =
      "Chamado criado com sucesso!";
  }
};
