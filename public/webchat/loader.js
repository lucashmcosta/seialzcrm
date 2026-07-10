/* Seialz Webchat — loader (v1)
 * ~2kb. Injeta só o launcher; o app do chat (iframe) baixa no clique.
 * Snippet na landing page:
 *   <script>window.SeialzWidget={key:"wgt_xxx"}</script>
 *   <script src="https://SEU_HOST/webchat/loader.js" async></script>
 */
(function () {
  "use strict";
  // Captura o próprio <script> (currentScript vale durante a execução do async).
  var self = document.currentScript;
  if (!self) { // fallback: acha pelo src caso currentScript não esteja disponível
    var ss = document.getElementsByTagName("script");
    for (var i = ss.length - 1; i >= 0; i--) { if (/\/webchat\/loader\.js/.test(ss[i].src)) { self = ss[i]; break; } }
  }
  var selfSrc = (self && self.src) || "";

  // Config: aceita window.SeialzWidget={...} E/OU query string na URL do loader
  // (?key=wgt_xxx&color=%230E7C5A&bubble=false&autoopen=8). A query string é o
  // caminho robusto — sobrevive a builders de LP que removem <script> inline ou
  // isolam blocos "embed" em iframes separados. Basta UMA tag:
  //   <script src="https://HOST/webchat/loader.js?key=wgt_xxx" async></script>
  var cfg = window.SeialzWidget || {};
  try {
    var qs = new URLSearchParams(selfSrc.split("?")[1] || "");
    if (!cfg.key && qs.get("key")) cfg.key = qs.get("key");
    if (!cfg.color && qs.get("color")) cfg.color = qs.get("color");
    if (cfg.bubble === undefined && qs.get("bubble") === "false") cfg.bubble = false;
    if (cfg.autoOpen === undefined && qs.get("autoopen")) cfg.autoOpen = qs.get("autoopen");
    if (!cfg.fn && qs.get("fn")) cfg.fn = qs.get("fn");
  } catch (e) { /* noop */ }

  var key = cfg.key;
  if (!key) { console.warn("[SeialzWidget] faltando a chave do widget (window.SeialzWidget.key ou ?key= na URL do loader)"); return; }

  var HOST = selfSrc.replace(/\/webchat\/loader\.js.*$/, "");
  var APP = HOST + "/webchat/app.html";
  var open = false, iframe = null;
  var hasBubble = cfg.bubble !== false; // window.SeialzWidget.bubble=false esconde a bolha

  // estilos responsivos (desktop = janela flutuante; mobile = fullscreen)
  var st = document.createElement("style");
  st.textContent =
    "#seialz-wc-btn{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:9999px;border:none;cursor:pointer;background:" + (cfg.color || "#0E7C5A") + ";color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25);z-index:2147483000;font-size:26px;display:flex;align-items:center;justify-content:center;transition:transform .15s}" +
    "#seialz-wc-btn:hover{transform:scale(1.06)}" +
    "#seialz-wc-frame{position:fixed;bottom:20px;right:20px;width:380px;height:600px;max-width:calc(100vw - 24px);max-height:calc(100vh - 40px);border:none;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.3);z-index:2147483001;background:transparent;display:none}" +
    "@media (max-width:480px){" +
      "#seialz-wc-frame{top:0;left:0;right:0;bottom:0;width:100%;height:100%;height:100dvh;max-width:100%;max-height:100%;border-radius:0}" +
      "#seialz-wc-btn{bottom:16px;right:16px;width:56px;height:56px}" +
    "}";
  document.head.appendChild(st);

  var btn = document.createElement("button");
  btn.id = "seialz-wc-btn";
  btn.setAttribute("aria-label", "Abrir chat");
  btn.innerHTML = "&#128172;"; // 💬

  function mountIframe() {
    iframe = document.createElement("iframe");
    iframe.id = "seialz-wc-frame";
    var hash = "#key=" + encodeURIComponent(key)
      + "&origin=" + encodeURIComponent(location.origin)
      + "&landing=" + encodeURIComponent(location.href)
      + "&ref=" + encodeURIComponent(document.referrer || "")
      + (cfg.fn ? "&fn=" + encodeURIComponent(cfg.fn) : "") // override do endpoint (preview/self-host)
      + (cfg.color ? "&color=" + encodeURIComponent(cfg.color) : ""); // cor da marca (bolha + interior)
    iframe.src = APP + hash;
    iframe.setAttribute("title", "Chat");
    iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin");
    document.body.appendChild(iframe);
  }

  function isMobile() { return window.matchMedia("(max-width:480px)").matches; }

  // No mobile, redimensiona o iframe pra área visível acima do teclado.
  // Feito AQUI (página pai) porque dentro do iframe o visualViewport do iOS
  // não reflete o teclado. Header fica no topo, composer sobe junto.
  function syncViewport() {
    if (!iframe || !open || !isMobile()) return;
    var vv = window.visualViewport; if (!vv) return;
    iframe.style.top = vv.offsetTop + "px";
    iframe.style.left = vv.offsetLeft + "px";
    iframe.style.right = "auto";
    iframe.style.bottom = "auto";
    iframe.style.width = vv.width + "px";
    iframe.style.height = vv.height + "px";
    iframe.style.borderRadius = "0";
  }
  function resetViewport() {
    if (!iframe) return;
    ["top", "left", "right", "bottom", "width", "height", "borderRadius"].forEach(function (k) { iframe.style[k] = ""; });
  }
  // re-sincroniza após a animação do teclado (iOS reporta a altura em etapas)
  function onVV() { syncViewport(); setTimeout(syncViewport, 120); setTimeout(syncViewport, 350); }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onVV);
    window.visualViewport.addEventListener("scroll", syncViewport);
  }

  function toggle() {
    if (!iframe) mountIframe();
    open = !open;
    iframe.style.display = open ? "block" : "none";
    if (hasBubble) btn.style.display = open ? "none" : "flex";
    if (open) syncViewport(); else resetViewport();
  }
  function openChat() { if (!open) toggle(); }
  function closeChat() { if (open) toggle(); }

  btn.onclick = toggle;
  window.addEventListener("message", function (e) {
    if (e.origin !== HOST) return;
    if (e.data === "seialz:close") { open = false; if (iframe) iframe.style.display = "none"; resetViewport(); if (hasBubble) btn.style.display = "flex"; }
  });

  // (2) Botão próprio do cliente: qualquer elemento com [data-seialz-chat] abre o chat.
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-seialz-chat]") : null;
    if (t) { e.preventDefault(); openChat(); }
  });

  // (3) API de código: SeialzWidget.open() / .close() / .toggle()
  window.SeialzWidget = cfg;
  cfg.open = openChat; cfg.close = closeChat; cfg.toggle = toggle;

  function mount() {
    // prefetch do app do chat: 1ª abertura fica rápida (não abre nem cria sessão)
    try { var lk = document.createElement("link"); lk.rel = "prefetch"; lk.href = APP; document.head.appendChild(lk); } catch (e) { /* noop */ }
    if (hasBubble) document.body.appendChild(btn);
    // (4) auto-abrir após N segundos (window.SeialzWidget.autoOpen = segundos)
    var ao = parseFloat(cfg.autoOpen);
    if (ao > 0) setTimeout(openChat, ao * 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
