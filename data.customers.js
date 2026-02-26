// data.customers.js
window.DataCustomers = {
  async list() {
    const companyId = window.Data.companyId;
    if (!companyId) throw new Error("companyId null");

    const { data, error } = await window.supabase
      .from("customers")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  },

  async create(customer) {
    const companyId = window.Data.companyId;
    if (!companyId) throw new Error("companyId null");

    const payload = {
      company_id: companyId,
      name: customer.name,
      phone: customer.phone,
      email: customer.email
    };

    const { data, error } = await window.supabase
      .from("customers")
      .insert(payload)
      .select();

    if (error) throw error;
    return data[0];
  },

  async remove(id) {
    const { error } = await window.supabase
      .from("customers")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }
};
