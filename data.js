async function getActiveCompanyId() {
  const s = getSavedSettings();

  if (s.activeCompanyId && typeof s.activeCompanyId === "string") {
    return s.activeCompanyId;
  }

  if (_mode === "mock") return mockDB.active_company_id;

  await requireSession();

  const { data, error } = await _supabase
    .from("company_users")
    .select("company_id")
    .limit(1);

  if (error) throw error;

  console.log("company_users raw:", data);

  if (!data || !data.length) {
    throw new Error("Usuário não possui empresa vinculada.");
  }

  const companyId = data[0].company_id;

  if (!companyId || typeof companyId !== "string") {
    throw new Error("company_id inválido no banco.");
  }

  s.activeCompanyId = companyId;
  saveSettings(s);

  return companyId;
}
