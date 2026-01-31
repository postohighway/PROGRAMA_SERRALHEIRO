const App = (() => {

  function init() {
    console.log("App iniciado");
  }

  function enterDemo() {
    try {
      Data.saveSettings({
        mode: "mock"
      });

      location.reload();
    } catch (e) {
      console.error("Erro ao entrar em demo:", e);
    }
  }

  function login(email, password) {
    const settings = Data.getSavedSettings();

    if (settings.mode === "supabase") {
      alert("Login real ainda será implementado");
      return;
    }

    enterDemo();
  }

  return {
    init,
    login,
    enterDemo
  };

})();

document.addEventListener("DOMContentLoaded", App.init);
