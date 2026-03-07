// portal-upload.js
// Cole suas chaves aqui:
const SUPABASE_URL = "COLOQUE_SUA_URL_AQUI";
const SUPABASE_ANON_KEY = "COLOQUE_SUA_ANON_KEY_AQUI";

// IMPORTANTE:
// - URL do cliente deve ser: /portal-upload.html?token=SEU_TOKEN
// - Backend deve ter RPC: resolve_ticket_media_token(p_token text)
// - Bucket padrão: 'ticket-media' (ajuste se o seu tiver outro nome)

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const BUCKET = "ticket-media"; // <-- ajuste se necessário
const MAX_PHOTOS = 5;
const MAX_VIDEO_SECONDS = 60;

const $ = (id) => document.getElementById(id);

const statusBox = $("statusBox");
const photosInput = $("photosInput");
const videoInput = $("videoInput");
const photoPreview = $("photoPreview");
const videoPreview = $("videoPreview");
const videoMeta = $("videoMeta");
const btnSend = $("btnSend");
const btnClear = $("btnClear");
const progressWrap = $("progressWrap");
const progressFill = $("progressBarFill");
const progressText = $("progressText");
const footerTicket = $("footerTicket");
const footerExpire = $("footerExpire");

let ctx = { token: null, ticket_id: null, company_id: null, expires_at: null };
let selectedPhotos = [];
let selectedVideo = null;

function setStatus(kind, title, body) {
  statusBox.className = `status ${kind}`;
  statusBox.querySelector(".statusTitle").textContent = title;
  statusBox.querySelector(".statusBody").textContent = body;
}
function humanDate(iso) {
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}
function getQueryToken() {
  const u = new URL(window.location.href);
  return u.searchParams.get("token");
}
function renderPhotos() {
  photoPreview.innerHTML = "";
  const title = photoPreview.closest(".slot").querySelector(".slotTitle");
  title.textContent = `Fotos (${selectedPhotos.length}/${MAX_PHOTOS})`;
  selectedPhotos.forEach((f, idx) => {
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.alt = `Foto ${idx + 1}`;
    img.src = URL.createObjectURL(f);
    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = `#${idx + 1}`;
    div.appendChild(img);
    div.appendChild(badge);
    photoPreview.appendChild(div);
  });
}
async function renderVideo() {
  videoPreview.innerHTML = "";
  const title = videoPreview.closest(".slot").querySelector(".slotTitle");
  title.textContent = `Vídeo (${selectedVideo ? 1 : 0}/1)`;
  videoMeta.textContent = "";
  if (!selectedVideo) return;

  const div = document.createElement("div");
  div.className = "thumb";
  div.style.aspectRatio = "16/10";

  const vid = document.createElement("video");
  vid.controls = true;
  vid.playsInline = true;
  vid.src = URL.createObjectURL(selectedVideo);

  const badge = document.createElement("div");
  badge.className = "badge";
  badge.textContent = "Vídeo";
  div.appendChild(vid);
  div.appendChild(badge);
  videoPreview.appendChild(div);

  const duration = await new Promise((resolve) => {
    vid.onloadedmetadata = () => resolve(vid.duration);
    vid.onerror = () => resolve(null);
  });

  if (duration && isFinite(duration)) {
    const sec = Math.round(duration);
    videoMeta.textContent = `Duração aproximada: ${sec}s (limite: ${MAX_VIDEO_SECONDS}s).`;
    if (sec > MAX_VIDEO_SECONDS) {
      setStatus("warn", "Vídeo muito longo", "Seu vídeo parece ter mais de 60s. Grave novamente mais curto para evitar falhas no envio.");
    }
  }
}
function clampPhotos(files) {
  const imgs = [];
  for (const f of files) if (f.type.startsWith("image/")) imgs.push(f);
  return imgs.slice(0, MAX_PHOTOS);
}
photosInput.addEventListener("change", () => {
  selectedPhotos = clampPhotos(photosInput.files || []);
  renderPhotos();
});
videoInput.addEventListener("change", async () => {
  const f = (videoInput.files || [])[0];
  if (!f) { selectedVideo = null; await renderVideo(); return; }
  if (!f.type.startsWith("video/")) {
    selectedVideo = null;
    await renderVideo();
    setStatus("warn", "Arquivo inválido", "Escolha um arquivo de vídeo.");
    return;
  }
  selectedVideo = f;
  await renderVideo();
});
btnClear.addEventListener("click", async () => {
  photosInput.value = "";
  videoInput.value = "";
  selectedPhotos = [];
  selectedVideo = null;
  renderPhotos();
  await renderVideo();
  setStatus("info", "Pronto", "Selecione as mídias e toque em Enviar.");
});
function setProgress(pct, text) {
  progressWrap.style.display = "block";
  progressFill.style.width = `${pct}%`;
  progressText.textContent = text || `${pct}%`;
}
function hideProgress() {
  progressWrap.style.display = "none";
  progressFill.style.width = "0%";
  progressText.textContent = "0%";
}
function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

async function main() {
  ctx.token = getQueryToken();
  if (!ctx.token) {
    setStatus("err", "Link inválido", "Faltou o token na URL. Exemplo: /portal-upload.html?token=XXXX");
    btnSend.disabled = true;
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  setStatus("info", "Validando link…", "Aguarde.");

  let resolved;
  try {
    const { data, error } = await supabase.rpc("resolve_ticket_media_token", { p_token: ctx.token });
    if (error) throw error;
    resolved = data;
  } catch (e) {
    console.error(e);
    setStatus("err", "Link inválido", "Token não encontrado, expirado ou inativo.");
    btnSend.disabled = true;
    return;
  }

  const row = Array.isArray(resolved) ? resolved[0] : resolved;
  ctx.ticket_id = row.ticket_id || row.ticketId || row.id;
  ctx.company_id = row.company_id || row.companyId;
  ctx.expires_at = row.expires_at || row.expiresAt || row.expires;

  footerTicket.textContent = ctx.ticket_id ? `Chamado: ${ctx.ticket_id}` : "";
  footerExpire.textContent = ctx.expires_at ? `Expira: ${humanDate(ctx.expires_at)}` : "";

  setStatus("ok", "Link válido", "Selecione as fotos e o vídeo e toque em Enviar.");

  btnSend.addEventListener("click", async () => {
    if (!selectedPhotos.length && !selectedVideo) {
      setStatus("warn", "Nada selecionado", "Selecione pelo menos 1 foto ou 1 vídeo.");
      return;
    }

    btnSend.disabled = true;
    btnClear.disabled = true;
    setProgress(1, "Preparando envio…");

    try {
      const day = new Date().toISOString().slice(0, 10);
      const basePath = `${ctx.company_id}/${ctx.ticket_id}/${day}`;

      const uploaded = [];

      for (let i = 0; i < selectedPhotos.length; i++) {
        const f = selectedPhotos[i];
        const pct = Math.round(5 + (i / Math.max(1, selectedPhotos.length + (selectedVideo ? 1 : 0))) * 80);
        setProgress(pct, `Enviando foto ${i + 1}/${selectedPhotos.length}…`);

        const path = `${basePath}/photo_${i + 1}_${Date.now()}_${safeFileName(f.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
          cacheControl: "3600",
          upsert: false,
          contentType: f.type,
        });
        if (upErr) throw upErr;

        uploaded.push({ kind: "foto", path });
      }

      if (selectedVideo) {
        setProgress(90, "Enviando vídeo…");
        const vf = selectedVideo;
        const path = `${basePath}/video_${Date.now()}_${safeFileName(vf.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, vf, {
          cacheControl: "3600",
          upsert: false,
          contentType: vf.type,
        });
        if (upErr) throw upErr;

        uploaded.push({ kind: "video", path });
      }

      setProgress(100, "Concluído ✅");
      setStatus("ok", "Enviado com sucesso", "Recebemos suas mídias. Você já pode fechar esta tela.");

      // Se você quiser gravar no banco, me diga o NOME DO BUCKET e
      // qual tabela é a fonte da verdade (media_files ou media),
      // que eu te passo o SQL/RPC certinho (um SQL por vez).
      console.log("uploaded:", uploaded);

    } catch (e) {
      console.error(e);
      hideProgress();
      setStatus("err", "Falha no envio", "Não foi possível enviar. Tente novamente (e, se for vídeo, grave mais curto).");
    } finally {
      btnSend.disabled = false;
      btnClear.disabled = false;
    }
  });

  renderPhotos();
  await renderVideo();
}

main();
