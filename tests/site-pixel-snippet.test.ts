import { describe, expect, test } from 'bun:test';
import { pixelSnippet } from '../src/lib/sitePixel';

describe('pixelSnippet', () => {
  test('basic tag', () => {
    expect(pixelSnippet('https://crm.seialz.com/', 'px_0123456789abcdef0123')).toBe('<script src="https://crm.seialz.com/px/s.js?k=px_0123456789abcdef0123" async></script>');
  });
  test('consent and WhatsApp text are encoded', () => {
    const s = pixelSnippet('https://crm.seialz.com', 'px_0123456789abcdef0123', { waitConsent: true, waText: 'Olá, vim do site & quero' });
    expect(s).toContain('consent=wait');
    expect(s).toContain('wa=Ol%C3%A1%2C+vim+do+site+%26+quero');
  });
});
