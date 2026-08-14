import { describe, expect, it } from 'vitest';
import {
  deriveSelectedEndpoint,
  pickLastValidMessage,
  replySelectionPayload,
} from '../src/lib/replyEndpointSelection';

describe('reply endpoint selection', () => {
  it('seleciona a nova inbound Evolution como última mensagem válida', () => {
    const last = pickLastValidMessage([
      {
        endpoint_id: 'meta-7067',
        direction: 'outbound',
        sent_at: '2026-08-14T20:20:00Z',
        created_at: '2026-08-14T20:20:01Z',
      },
      {
        endpoint_id: 'evolution-7020',
        direction: 'inbound',
        sent_at: '2026-08-14T20:22:35Z',
        created_at: '2026-08-14T20:22:36Z',
      },
    ]);

    expect(last?.endpoint_id).toBe('evolution-7020');
    const selection = deriveSelectedEndpoint({
      manualEndpointId: null,
      lastMessageEndpointId: last?.endpoint_id ?? null,
      routeDefaultEndpointId: 'meta-7067',
    });
    expect(selection).toEqual({ endpointId: 'evolution-7020', source: 'derived' });
  });

  it('desempata sent_at por created_at', () => {
    const last = pickLastValidMessage([
      { endpoint_id: 'older', direction: 'inbound', sent_at: '2026-08-14T20:22:35Z', created_at: '2026-08-14T20:22:35Z' },
      { endpoint_id: 'newer', direction: 'outbound', sent_at: '2026-08-14T20:22:35Z', created_at: '2026-08-14T20:22:36Z' },
    ]);
    expect(last?.endpoint_id).toBe('newer');
  });

  it('derived mantém o endpoint apenas como hint visual', () => {
    expect(replySelectionPayload(true, { endpointId: 'stale-7067', source: 'derived' }))
      .toEqual({ source: 'derived', endpointId: 'stale-7067' });
  });

  it('thread vazia usa o default legado da Route', () => {
    expect(deriveSelectedEndpoint({
      manualEndpointId: null,
      lastMessageEndpointId: null,
      routeDefaultEndpointId: 'route-default',
    })).toEqual({ endpointId: 'route-default', source: 'derived' });
  });
});