const SUPABASE_URL = "https://lnfaukysiiflparrciwz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuZmF1a3lzaWlmbHBhcnJjaXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Njk4NDEsImV4cCI6MjA4MDQ0NTg0MX0.mFBYdGIsdI00cWeou_NgBx8nNejZJeKEwK84JVKafTI";
const COMPANY_ID = "4e44632d-15b0-484d-bc01-ec8bff2e2189";
const PORTAL_TOKEN = "4e44632d-15b0-484d-bc01-ec8bff2e2189";

document.getElementById("ticketForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("client_name").value;
  const phone = document.getElementById("client_phone").value;
  const description = document.getElementById("description").value;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_create_ticket_via_portal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      p_company_id: COMPANY_ID,
      p_portal_token: PORTAL_TOKEN,
      p_client_name: name,
      p_client_phone: phone,
      p_description: description,
      p_due_date: null
    })
  });

  const data = await response.json();

  if (!data.ticket_id) {
    alert("Erro ao criar chamado");
    return;
  }

  document.getElementById("successBox").classList.remove("hidden");
  document.getElementById("ticketForm").reset();
});