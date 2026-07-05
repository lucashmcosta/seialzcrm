#!/usr/bin/env node
/**
 * Gera páginas legais como HTML estático em dist/ após o `vite build`.
 *
 * Motivação: revisores da Meta (Privacy Policy / Terms / Data Deletion)
 * abrem essas URLs diretamente e podem não executar JS. Emitindo arquivos
 * HTML reais em dist/ nós garantimos que o conteúdo completo do documento
 * legal esteja no HTML servido, mesmo sendo um SPA Vite/React.
 *
 * Vercel serve arquivos do filesystem ANTES do rewrite `/(.*) → /index.html`,
 * então dist/en/privacy-policy/index.html vence a rota SPA para esse path.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const LOCALES = resolve(ROOT, "src/locales");

marked.setOptions({ gfm: true, breaks: false });

function slugify(input) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function renderMarkdown(md) {
  const stripped = md
    .replace(/^#\s+[^\n]*\n+/, "")
    .replace(/^\*\*(?:Última atualização|Last updated)[^*]+\*\*\s*\n+/im, "");
  const html = marked.parse(stripped);
  return html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (_m, attrs, inner) => {
    const text = String(inner).replace(/<[^>]+>/g, "");
    const id = slugify(text);
    return `<h2${attrs} id="${id}">${inner}</h2>`;
  });
}

function extractUpdatedAt(md) {
  const m = md.match(/\*\*(?:Última atualização|Last updated)[:：]\s*([^*]+)\*\*/i);
  return m ? m[1].trim() : "";
}

/** Definição das 6 páginas. */
const PAGES = [
  {
    url: "/en/privacy-policy",
    mdFile: "en/privacy-policy.md",
    lang: "en",
    homeUrl: "/en",
    title: "Privacy Policy",
    seoTitle: "Privacy Policy — Seialz",
    seoDesc: "How Kairos Labs LLC (Seialz) collects, uses, stores, shares, and protects personal information, including data received from Meta platforms.",
    updatedLabel: "Last updated",
    footer: { privacy: "Privacy Policy", terms: "Terms of Service", data: "Data Deletion" },
    altUrl: "/politica-de-privacidade",
    altLabel: "PT",
    currentLabel: "EN",
    alternates: { en: "/en/privacy-policy", "pt-BR": "/politica-de-privacidade" },
  },
  {
    url: "/en/terms-of-service",
    mdFile: "en/terms-of-service.md",
    lang: "en",
    homeUrl: "/en",
    title: "Terms of Service",
    seoTitle: "Terms of Service — Seialz",
    seoDesc: "Terms and conditions for using the Seialz platform (Kairos Labs LLC).",
    updatedLabel: "Last updated",
    footer: { privacy: "Privacy Policy", terms: "Terms of Service", data: "Data Deletion" },
    altUrl: "/termos-de-servico",
    altLabel: "PT",
    currentLabel: "EN",
    alternates: { en: "/en/terms-of-service", "pt-BR": "/termos-de-servico" },
  },
  {
    url: "/en/data-deletion",
    mdFile: "en/data-deletion.md",
    lang: "en",
    homeUrl: "/en",
    title: "Data Deletion Instructions",
    seoTitle: "Data Deletion Instructions — Seialz",
    seoDesc: "How to request the deletion of your data from Seialz, including data received through Meta products (WhatsApp, Facebook, Instagram).",
    updatedLabel: "Last updated",
    footer: { privacy: "Privacy Policy", terms: "Terms of Service", data: "Data Deletion" },
    altUrl: "/exclusao-de-dados",
    altLabel: "PT",
    currentLabel: "EN",
    alternates: { en: "/en/data-deletion", "pt-BR": "/exclusao-de-dados" },
  },
  {
    url: "/politica-de-privacidade",
    mdFile: "pt-BR/privacy-policy.md",
    lang: "pt-BR",
    homeUrl: "/pt-br",
    title: "Política de Privacidade",
    seoTitle: "Política de Privacidade — Seialz",
    seoDesc: "Como a Kairos Labs LLC (Seialz) coleta, utiliza, armazena, compartilha e protege dados pessoais, incluindo dados recebidos das plataformas Meta.",
    updatedLabel: "Última atualização",
    footer: { privacy: "Política de Privacidade", terms: "Termos de Serviço", data: "Exclusão de Dados" },
    altUrl: "/en/privacy-policy",
    altLabel: "EN",
    currentLabel: "PT",
    alternates: { en: "/en/privacy-policy", "pt-BR": "/politica-de-privacidade" },
  },
  {
    url: "/termos-de-servico",
    mdFile: "pt-BR/terms-of-service.md",
    lang: "pt-BR",
    homeUrl: "/pt-br",
    title: "Termos de Serviço",
    seoTitle: "Termos de Serviço — Seialz",
    seoDesc: "Termos e condições de uso da plataforma Seialz (Kairos Labs LLC).",
    updatedLabel: "Última atualização",
    footer: { privacy: "Política de Privacidade", terms: "Termos de Serviço", data: "Exclusão de Dados" },
    altUrl: "/en/terms-of-service",
    altLabel: "EN",
    currentLabel: "PT",
    alternates: { en: "/en/terms-of-service", "pt-BR": "/termos-de-servico" },
  },
  {
    url: "/exclusao-de-dados",
    mdFile: "pt-BR/data-deletion.md",
    lang: "pt-BR",
    homeUrl: "/pt-br",
    title: "Instruções de Exclusão de Dados",
    seoTitle: "Instruções de Exclusão de Dados — Seialz",
    seoDesc: "Como solicitar a exclusão dos seus dados no Seialz, incluindo dados recebidos por meio de produtos Meta (WhatsApp, Facebook, Instagram).",
    updatedLabel: "Última atualização",
    footer: { privacy: "Política de Privacidade", terms: "Termos de Serviço", data: "Exclusão de Dados" },
    altUrl: "/en/data-deletion",
    altLabel: "EN",
    currentLabel: "PT",
    alternates: { en: "/en/data-deletion", "pt-BR": "/exclusao-de-dados" },
  },
];

const SITE_ORIGIN = "https://seialz.com";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageTemplate(p, bodyHtml, updatedAt) {
  const canonical = `${SITE_ORIGIN}${p.url}`;
  const hreflangEn = `${SITE_ORIGIN}${p.alternates.en}`;
  const hreflangPt = `${SITE_ORIGIN}${p.alternates["pt-BR"]}`;
  const ogLocale = p.lang === "en" ? "en_US" : "pt_BR";
  return `<!doctype html>
<html lang="${p.lang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${escapeHtml(p.seoTitle)}</title>
<meta name="description" content="${escapeHtml(p.seoDesc)}" />
<link rel="canonical" href="${canonical}" />
<link rel="alternate" hreflang="en" href="${hreflangEn}" />
<link rel="alternate" hreflang="pt-BR" href="${hreflangPt}" />
<link rel="alternate" hreflang="x-default" href="${hreflangPt}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="${ogLocale}" />
<meta property="og:title" content="${escapeHtml(p.seoTitle)}" />
<meta property="og:description" content="${escapeHtml(p.seoDesc)}" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${escapeHtml(p.seoTitle)}" />
<meta name="twitter:description" content="${escapeHtml(p.seoDesc)}" />
<meta name="robots" content="index, follow" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --paper: #FFFFFF;
    --ink: #0A0A0A;
    --soft: #4A4D4A;
    --ash: #7A7E7A;
    --line: #E6E8E6;
    --green: #32CD32;
    --snow: #F6F7F6;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--paper); color: var(--ink); font-family: 'Sora', sans-serif; -webkit-font-smoothing: antialiased; }
  a { color: var(--green); }
  header.site {
    position: sticky; top: 0; z-index: 10; background: rgba(255,255,255,0.95); backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
    padding: 14px 24px; display: flex; align-items: center; justify-content: space-between;
  }
  header.site .brand { font-weight: 700; letter-spacing: -0.01em; color: var(--ink); text-decoration: none; font-size: 18px; }
  header.site .lang { font-size: 13px; color: var(--ash); }
  header.site .lang .current { color: var(--ink); font-weight: 600; }
  header.site .lang .sep { color: var(--line); margin: 0 8px; }
  header.site .lang a { color: var(--green); text-decoration: none; font-weight: 500; }
  main { max-width: 720px; margin: 0 auto; padding: 64px 24px 96px; }
  main h1 { font-size: 2rem; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 12px; color: var(--ink); line-height: 1.2; }
  main .updated { font-size: 14px; color: var(--soft); margin: 0 0 32px; }
  main .updated strong { color: var(--ink); font-weight: 600; }
  .content { color: var(--soft); }
  .content h1, .content h2, .content h3, .content h4 {
    color: var(--ink); font-weight: 600; letter-spacing: -0.01em;
    margin-top: 2.5rem; margin-bottom: 1rem; line-height: 1.25;
  }
  .content h2 { font-size: 1.5rem; scroll-margin-top: 5rem; }
  .content h3 { font-size: 1.15rem; }
  .content p, .content li { font-size: 1rem; line-height: 1.75; margin-bottom: 1rem; }
  .content ul, .content ol { padding-left: 1.5rem; margin-bottom: 1rem; }
  .content li { margin-bottom: 0.5rem; }
  .content strong { color: var(--ink); font-weight: 600; }
  .content a { text-decoration: underline; }
  .content hr { border: none; border-top: 1px solid var(--line); margin: 2.5rem 0; }
  .content code { background: var(--snow); padding: 2px 6px; border-radius: 4px; font-family: 'Space Mono', monospace; font-size: 0.9em; color: var(--ink); }
  .content table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; }
  .content th, .content td { border: 1px solid var(--line); padding: 10px 12px; text-align: left; vertical-align: top; }
  .content th { background: var(--snow); color: var(--ink); font-weight: 600; }
  footer.site {
    border-top: 1px solid var(--line); background: var(--snow); padding: 32px 24px;
    color: var(--ash); font-size: 14px;
  }
  footer.site .row { max-width: 1120px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between; }
  footer.site a { color: var(--ash); text-decoration: none; }
  footer.site a:hover { color: var(--green); }
</style>
</head>
<body>
<header class="site">
  <a class="brand" href="${p.homeUrl}">Seialz</a>
  <div class="lang" aria-label="Language selector">
    <span class="current">${p.currentLabel}</span>
    <span class="sep" aria-hidden="true">|</span>
    <a href="${p.altUrl}" aria-label="View in ${p.altLabel}">${p.altLabel}</a>
  </div>
</header>
<main>
  <h1>${escapeHtml(p.title)}</h1>
  ${updatedAt ? `<p class="updated">${escapeHtml(p.updatedLabel)}: <strong>${escapeHtml(updatedAt)}</strong></p>` : ""}
  <article class="content">
${bodyHtml}
  </article>
</main>
<footer class="site">
  <div class="row">
    <span>© ${new Date().getFullYear()} Kairos Labs LLC · Seialz</span>
    <span>
      <a href="${p.alternates[p.lang]}">${escapeHtml(p.footer.privacy)}</a>
      &nbsp;·&nbsp;
      <a href="${p.lang === "en" ? "/en/terms-of-service" : "/termos-de-servico"}">${escapeHtml(p.footer.terms)}</a>
      &nbsp;·&nbsp;
      <a href="${p.lang === "en" ? "/en/data-deletion" : "/exclusao-de-dados"}">${escapeHtml(p.footer.data)}</a>
    </span>
  </div>
</footer>
</body>
</html>
`;
}

function main() {
  if (!existsSync(DIST)) {
    console.error(`[build-legal-pages] dist/ not found at ${DIST}. Run 'vite build' first.`);
    process.exit(1);
  }
  let ok = 0;
  for (const p of PAGES) {
    const mdPath = resolve(LOCALES, p.mdFile);
    if (!existsSync(mdPath)) {
      console.error(`[build-legal-pages] missing markdown: ${mdPath}`);
      process.exit(1);
    }
    const md = readFileSync(mdPath, "utf8");
    const bodyHtml = renderMarkdown(md);
    const updatedAt = extractUpdatedAt(md);
    const html = pageTemplate(p, bodyHtml, updatedAt);
    const outDir = resolve(DIST, "." + p.url);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "index.html"), html, "utf8");
    console.log(`[build-legal-pages] wrote ${p.url}/index.html`);
    ok++;
  }
  console.log(`[build-legal-pages] done — ${ok} pages generated`);
}

main();
