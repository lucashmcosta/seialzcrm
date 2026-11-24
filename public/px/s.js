/* Pixel do Seialz (v1)
 * Grava de onde o visitante veio (UTMs, clique de anúncio, site de origem) e
 * leva isso para o formulário e para a conversa de WhatsApp aberta pelo site.
 * Instalação (direto no site ou numa tag "HTML personalizado" do GTM):
 *   <script src="https://crm.seialz.com/px/s.js?k=px_xxx" async></script>
 * Opções na URL: consent=wait (só grava depois de seialzPixel('consent', true));
 * wa=Texto (mensagem padrão quando o link de WhatsApp não tem texto).
 */
(function () {
  "use strict";
  if (window.__seialzPixelLoaded) return;
  window.__seialzPixelLoaded = true;

  var self = document.currentScript;
  if (!self) {
    var ss = document.getElementsByTagName("script");
    for (var i = ss.length - 1; i >= 0; i--) { if (/\/px\/s\.js/.test(ss[i].src)) { self = ss[i]; break; } }
  }
  var qs;
  try { qs = new URLSearchParams(((self && self.src) || "").split("?")[1] || ""); } catch (e) { return; }
  var cfg = window.SeialzPixel || {};
  var KEY = cfg.key || qs.get("k");
  if (!/^px_[a-f0-9]{20}$/.test(KEY || "")) { console.warn("[SeialzPixel] chave do pixel ausente ou inválida"); return; }
  var ENDPOINT = cfg.endpoint || qs.get("fn") || "https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/site-pixel";
  var WA_TEXT = cfg.waText || qs.get("wa") || "Olá!";
  var WAIT = (cfg.consent || qs.get("consent")) === "wait";

  var TRACK = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
    "fbclid", "gclid", "gbraid", "wbraid", "meta_ad_id"];
  var FIELDS = TRACK.concat(["landing_url", "referrer_url", "fbp", "fbc", "sz_ref", "site_entry"]);
  var VID = "_sz_vid", STATE = "_sz_px", DAYS = 395, SAME_VISIT = 30 * 60 * 1000;
  var WA = /^(https?:\/\/(wa\.me|api\.whatsapp\.com\/send|web\.whatsapp\.com\/send)|whatsapp:\/\/send)/i;
  var state = null, started = false, stopped = false;

  // ---------- cookies primários (valem para os subdomínios do site) ----------
  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return null; }
  }
  function setCookie(name, value, days) {
    var exp = "; expires=" + new Date(Date.now() + days * 864e5).toUTCString() + "; path=/; SameSite=Lax" +
      (location.protocol === "https:" ? "; Secure" : "");
    var parts = location.hostname.split(".");
    // Tenta o domínio mais alto aceito (ex.: .site.com.br), senão fica no host atual.
    for (var i = Math.min(parts.length, 4) - 2; i >= 0; i--) {
      var dom = parts.slice(i).join(".");
      if (dom.indexOf(".") < 0) continue;
      document.cookie = name + "=" + encodeURIComponent(value) + exp + "; domain=." + dom;
      if (getCookie(name) === value) return;
    }
    document.cookie = name + "=" + encodeURIComponent(value) + exp;
  }
  function dropCookie(name) {
    var parts = location.hostname.split(".");
    for (var i = 0; i < parts.length - 1; i++) {
      document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=." + parts.slice(i).join(".");
    }
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  }
  function randomId() {
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    var s = "";
    for (var i = 0; i < b.length; i++) s += ("0" + b[i].toString(16)).slice(-2);
    return "v" + s;
  }
  function readState() {
    try { return JSON.parse(getCookie(STATE) || "{}") || {}; } catch (e) { return {}; }
  }
  function saveState() {
    var raw = JSON.stringify(state);
    if (raw.length > 3000) { delete state.first; raw = JSON.stringify(state); }
    setCookie(STATE, raw, DAYS);
  }

  // ---------- leitura da visita ----------
  function bare(h) { return String(h || "").toLowerCase().replace(/^www\./, ""); }
  function currentVisit() {
    var p = new URLSearchParams(location.search), ev = {}, signal = false;
    var landing = location.origin + location.pathname, lq = [];
    for (var i = 0; i < TRACK.length; i++) {
      var v = (p.get(TRACK[i]) || "").trim();
      if (v && v.indexOf("{{") < 0) { ev[TRACK[i]] = v.slice(0, 500); lq.push(TRACK[i] + "=" + encodeURIComponent(ev[TRACK[i]])); signal = true; }
    }
    var refHost = "";
    try { refHost = document.referrer ? new URL(document.referrer).host : ""; } catch (e) { refHost = ""; }
    if (refHost && bare(refHost) !== bare(location.host)) { ev.referrer_url = "https://" + refHost + "/"; signal = true; }
    ev.landing_url = (landing + (lq.length ? "?" + lq.join("&") : "")).slice(0, 1000);
    return { ev: ev, signal: signal, page: ev.landing_url, ref: refHost ? "https://" + refHost + "/" : "" };
  }
  function sameEvidence(a, b) {
    if (!a || !b) return false;
    for (var i = 0; i < FIELDS.length; i++) {
      var k = FIELDS[i];
      if (k === "landing_url") continue;
      if ((a[k] || "") !== (b[k] || "")) return false;
    }
    return true;
  }
  function metaCookies(ev) {
    var fbp = getCookie("_fbp"), fbc = getCookie("_fbc");
    if (!fbc && ev.fbclid) fbc = "fb.1." + Date.now() + "." + ev.fbclid;
    return { fbp: fbp || undefined, fbc: fbc || undefined };
  }

  function send(visit, done) {
    var m = metaCookies(visit.ev);
    var body = JSON.stringify({ k: KEY, vid: state.vid, url: visit.page, ref: visit.ref, fbp: m.fbp, fbc: m.fbc });
    try {
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, credentials: "omit" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && /^[A-Z0-9]{8}$/.test(j.ref || "")) done(j.ref); })
        .catch(function () { /* sem rede: tenta na próxima página */ });
    } catch (e) { /* navegador antigo */ }
  }

  function start() {
    if (started || stopped) return;
    started = true;
    state = readState();
    state.vid = getCookie(VID) || state.vid || randomId();
    setCookie(VID, state.vid, DAYS);
    var visit = currentVisit(), now = Date.now();
    if (visit.signal) {
      if (state.last && state.last.r && sameEvidence(state.last.e, visit.ev) && now - state.last.t < SAME_VISIT) {
        state.last.t = now; saveState(); decorateAll(); return;
      }
      send(visit, function (code) {
        state.last = { e: visit.ev, r: code, t: now };
        if (!state.first) state.first = state.last;
        saveState(); decorateAll();
      });
    } else if (!state.last && !(state.direct && state.direct.r)) {
      visit.ev.site_entry = "direct";
      send(visit, function (code) { state.direct = { r: code, t: now }; saveState(); decorateAll(); });
    } else {
      decorateAll();
    }
    saveState();
  }

  // ---------- o que vai para o formulário e para o WhatsApp ----------
  function currentRef() {
    if (!state) return null;
    return (state.last && state.last.r) || (state.direct && state.direct.r) || null;
  }
  function currentFields() {
    if (!state) return {};
    var out = {}, src = (state.last && state.last.e) || null;
    if (src) { for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k]; }
    else out.site_entry = "direct";
    var m = metaCookies(out);
    if (m.fbp) out.fbp = m.fbp;
    if (m.fbc) out.fbc = m.fbc;
    var ref = currentRef();
    if (ref) out.sz_ref = ref;
    return out;
  }
  function fillForm(form) {
    if (!state || stopped || !form || !form.elements) return;
    // Busca do site não é lead: não suja o endereço da busca.
    if (form.getAttribute("role") === "search" || form.querySelector("input[type=search],input[name=s],input[name=q]")) return;
    var f = currentFields();
    for (var k in f) {
      if (!Object.prototype.hasOwnProperty.call(f, k)) continue;
      var el = form.elements.namedItem(k);
      if (el && "value" in el) { if (!el.value) el.value = f[k]; continue; }
      if (el) continue;
      var input = document.createElement("input");
      input.type = "hidden"; input.name = k; input.value = f[k];
      form.appendChild(input);
    }
  }
  function decorateLink(a) {
    var ref = currentRef();
    if (!ref || stopped || !a || !a.href || !WA.test(a.href) || a.href.indexOf("%5Bsz%3A") >= 0) return;
    try {
      var u = new URL(a.href);
      var text = u.searchParams.get("text") || WA_TEXT;
      if (text.indexOf("[sz:") >= 0) return;
      u.searchParams.set("text", text + " [sz:" + ref + "]");
      a.href = u.toString();
    } catch (e) { /* link fora do padrão: deixa como está */ }
  }
  function decorateAll() {
    var links = document.getElementsByTagName("a");
    for (var i = 0; i < links.length; i++) decorateLink(links[i]);
  }

  document.addEventListener("submit", function (e) { fillForm(e.target); }, true);
  function onPointer(e) {
    var t = e.target;
    while (t && t !== document && t.tagName !== "A") t = t.parentNode;
    if (t && t.tagName === "A") decorateLink(t);
  }
  document.addEventListener("click", onPointer, true);
  document.addEventListener("auxclick", onPointer, true);
  document.addEventListener("touchstart", onPointer, { capture: true, passive: true });

  // API: seialzPixel('consent', true|false) e seialzPixel('get').
  window.seialzPixel = function (cmd, arg) {
    if (cmd === "consent") {
      if (arg === false) { stopped = true; started = false; dropCookie(VID); dropCookie(STATE); state = null; return; }
      stopped = false; start(); return;
    }
    if (cmd === "get") return { ref: currentRef(), fields: currentFields() };
    if (cmd === "fill" && arg) fillForm(arg);
  };

  if (!WAIT || cfg.consentGranted === true) start();
})();
