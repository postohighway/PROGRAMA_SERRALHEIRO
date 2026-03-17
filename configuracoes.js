(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }

  function escapeHtml(t) {
    return String(t || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function normalizarWhatsApp(val) {
    const digits = String(val || "").replace(/\D/g, "");
    if (digits.length >= 12 && digits.startsWith("55")) return digits;
    if (digits.length >= 10) return "55" + digits;
    return digits;
  }

  function montarLinkWhatsApp(numero, texto) {
    const n = normalizarWhatsApp(numero);
    if (!n || n.length < 12) return "";
    const msg = encodeURIComponent(texto || "Preciso de atendimento urgente");
    return "https://wa.me/" + n + "?text=" + msg;
  }

  async function renderizarConfiguracoes(opts) {
    const areaId = (opts && opts.areaId) || "conteudoTela";
    const sb = (opts && opts.sb) || window.sb;
    const setErro = (opts && opts.setErro) || (function () {});
    const setInfo = (opts && opts.setInfo) || (function () {});
    const setTitulo = (opts && opts.setTitulo) || (function () {});

    setTitulo("Configurações", "Ajustes do sistema");
    setErro("");
    setInfo("");

    const alvo = document.getElementById(areaId);
    if (!alvo) return;

    if (!(sb && sb.db && sb.companyId)) {
      alvo.innerHTML = `<div class="panel"><h2>Configurações</h2><div class="panel-sub">Conexão ou companyId não disponível.</div></div>`;
      return;
    }

    let valorAtual = "";

    try {
      const r = await sb.db.from("company_settings")
        .select("setting_value")
        .eq("company_id", sb.companyId)
        .eq("setting_key", "whatsapp_plantao")
        .maybeSingle();
      if (!r.error && r.data) valorAtual = r.data.setting_value || "";
    } catch (_) {}

    let templateContrato = "";
    try {
      const r2 = await sb.db.from("company_settings")
        .select("setting_value")
        .eq("company_id", sb.companyId)
        .eq("setting_key", "contract_template_default")
        .maybeSingle();
      if (!r2.error && r2.data) templateContrato = r2.data.setting_value || "";
    } catch (_) {}
    const templatePadrao = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MANUTENÇÃO

CONTRATANTE: {{NOME_CLIENTE}}
Telefone: {{TELEFONE}}
Endereço: {{ENDERECO}}
E-mail: {{EMAIL}}

Pelo presente instrumento, as partes celebram o contrato de prestação de serviços de manutenção.

1. OBJETO: Manutenção conforme plano SLA {{PLANO_SLA}}.
2. VALOR: R$ {{VALOR_MENSAL}} (mensal).
3. VIGÊNCIA: Início em {{DATA_INICIO}}.
4. ATENDIMENTO: {{DESCRICAO_ATENDIMENTO}}

Data: {{DATA_HOJE}}

_________________________________________
Assinatura do Contratante`;

    alvo.innerHTML = `
      <div class="panel">
        <h2>WhatsApp de plantão</h2>
        <div class="panel-sub">Número ativo para atendimento urgente. O cliente verá este número no portal e poderá clicar para abrir o WhatsApp.</div>
        <div style="margin-top:16px">
          <label class="label">Número com DDD (ex: 11 99999-9999)</label>
          <input id="whatsappPlantao" class="field" type="text" placeholder="11 99999-9999" value="${escapeHtml(valorAtual)}" style="max-width:280px">
          <div class="muted" style="margin-top:8px">Apenas dígitos. O link wa.me será gerado automaticamente.</div>
        </div>
        <div style="margin-top:16px">
          <button id="btnSalvarPlantao" class="btn btn-primary">Salvar</button>
        </div>
        <div id="previewPlantao" style="margin-top:20px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--panel-2);display:none">
          <div class="muted" style="margin-bottom:8px">Preview do link (cliente verá isso no portal):</div>
          <a id="linkPreviewPlantao" href="#" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700">Clique para abrir WhatsApp</a>
        </div>
      </div>

      <div class="panel" style="margin-top:20px">
        <h2>Template padrão do contrato</h2>
        <div class="panel-sub">Use os placeholders para preenchimento automático ao criar contrato a partir do chamado: {{NOME_CLIENTE}}, {{TELEFONE}}, {{ENDERECO}}, {{EMAIL}}, {{PLANO_SLA}}, {{VALOR_MENSAL}}, {{DATA_INICIO}}, {{DATA_HOJE}}, {{DESCRICAO_ATENDIMENTO}}</div>
        <div style="margin-top:16px">
          <label class="label">Conteúdo do contrato (editável)</label>
          <textarea id="templateContrato" class="textarea" rows="18" placeholder="Modelo de contrato..." style="font-family:monospace;font-size:13px">${escapeHtml(templateContrato || templatePadrao)}</textarea>
        </div>
        <div style="margin-top:16px">
          <button id="btnSalvarTemplateContrato" class="btn btn-primary">Salvar template</button>
        </div>
      </div>
    `;

    function atualizarPreview() {
      const v = $("#whatsappPlantao", alvo).value.trim();
      const link = montarLinkWhatsApp(v, "Preciso de atendimento urgente");
      const preview = $("#previewPlantao", alvo);
      const linkEl = $("#linkPreviewPlantao", alvo);
      if (link) {
        linkEl.href = link;
        linkEl.textContent = "Falar no WhatsApp com " + (v || "número configurado");
        preview.style.display = "block";
      } else {
        preview.style.display = "none";
      }
    }

    $("#whatsappPlantao", alvo).addEventListener("input", atualizarPreview);
    atualizarPreview();

    $("#btnSalvarPlantao", alvo).addEventListener("click", async () => {
      const v = $("#whatsappPlantao", alvo).value.trim();
      const n = normalizarWhatsApp(v);
      if (v && n.length < 12) {
        setErro("Informe um número válido com DDD (ex: 11 99999-9999).");
        return;
      }
      setErro("");
      const payload = {
        company_id: sb.companyId,
        setting_key: "whatsapp_plantao",
        setting_value: v,
        updated_at: new Date().toISOString()
      };
      const { error } = await sb.db.from("company_settings").upsert(payload, {
        onConflict: "company_id,setting_key",
        ignoreDuplicates: false
      });
      if (error) {
        setErro("Erro ao salvar: " + (error.message || error));
        return;
      }
      setInfo("Número de plantão salvo. O link será exibido no portal do cliente.");
      valorAtual = v;
    });

    $("#btnSalvarTemplateContrato", alvo).addEventListener("click", async () => {
      const v = $("#templateContrato", alvo).value.trim();
      setErro("");
      const payload = {
        company_id: sb.companyId,
        setting_key: "contract_template_default",
        setting_value: v || templatePadrao,
        updated_at: new Date().toISOString()
      };
      const { error } = await sb.db.from("company_settings").upsert(payload, {
        onConflict: "company_id,setting_key",
        ignoreDuplicates: false
      });
      if (error) {
        setErro("Erro ao salvar template: " + (error.message || error));
        return;
      }
      setInfo("Template do contrato salvo. Será usado ao criar contratos a partir de chamados.");
    });
  }

  async function obterTemplateContrato(sb) {
    if (!sb || !sb.db || !sb.companyId) return "";
    try {
      const r = await sb.db.from("company_settings")
        .select("setting_value")
        .eq("company_id", sb.companyId)
        .eq("setting_key", "contract_template_default")
        .maybeSingle();
      if (!r.error && r.data && r.data.setting_value) return r.data.setting_value;
    } catch (_) {}
    return `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MANUTENÇÃO

CONTRATANTE: {{NOME_CLIENTE}}
Telefone: {{TELEFONE}}
Endereço: {{ENDERECO}}
E-mail: {{EMAIL}}

Pelo presente instrumento, as partes celebram o contrato de prestação de serviços de manutenção.

1. OBJETO: Manutenção conforme plano SLA {{PLANO_SLA}}.
2. VALOR: R$ {{VALOR_MENSAL}} (mensal).
3. VIGÊNCIA: Início em {{DATA_INICIO}}.
4. ATENDIMENTO: {{DESCRICAO_ATENDIMENTO}}

Data: {{DATA_HOJE}}

_________________________________________
Assinatura do Contratante`;
  }

  window.ModuloConfiguracoes = {
    renderizarConfiguracoes,
    montarLinkWhatsApp,
    normalizarWhatsApp,
    obterTemplateContrato
  };
})();
