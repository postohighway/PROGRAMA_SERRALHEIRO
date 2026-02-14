window.ViewCustomers = {
  async render() {
    const app = document.getElementById("view");

    app.innerHTML = `
      <div class="card">
        <h2>Clientes</h2>

        <div class="form-row">
          <input id="c_name" placeholder="Nome" />
          <input id="c_phone" placeholder="Telefone" />
          <input id="c_email" placeholder="Email" />
          <button class="btn btn-primary" id="btnSaveCustomer">Salvar</button>
        </div>

        <table class="table" id="customersTable">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Email</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;

    document
      .getElementById("btnSaveCustomer")
      .addEventListener("click", this.save);

    await this.load();
  },

  async load() {
    const tbody = document.querySelector("#customersTable tbody");
    tbody.innerHTML = "";

    const customers = await window.DataCustomers.list();

    customers.forEach(c => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${c.name}</td>
        <td>${c.phone || ""}</td>
        <td>${c.email || ""}</td>
        <td>
          <button class="btn btn-danger" data-id="${c.id}">
            Excluir
          </button>
        </td>
      `;

      tr.querySelector("button").onclick = async () => {
        await window.DataCustomers.remove(c.id);
        await this.load();
      };

      tbody.appendChild(tr);
    });
  },

  async save() {
    const name = document.getElementById("c_name").value.trim();
    const phone = document.getElementById("c_phone").value.trim();
    const email = document.getElementById("c_email").value.trim();

    if (!name) return alert("Nome obrigatório");

    await window.DataCustomers.create({ name, phone, email });

    document.getElementById("c_name").value = "";
    document.getElementById("c_phone").value = "";
    document.getElementById("c_email").value = "";

    await window.ViewCustomers.load();
  }
};
