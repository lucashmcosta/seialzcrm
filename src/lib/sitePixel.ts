// Código de instalação do pixel do Seialz (public/px/s.js).
export function pixelSnippet(host: string, key: string, opts: { waitConsent?: boolean; waText?: string } = {}): string {
  const params = new URLSearchParams({ k: key });
  if (opts.waitConsent) params.set('consent', 'wait');
  const wa = opts.waText?.trim();
  if (wa) params.set('wa', wa.slice(0, 120));
  return `<script src="${host.replace(/\/$/, '')}/px/s.js?${params.toString()}" async></script>`;
}
