import { describe, expect, test } from 'bun:test';
import { agentPauseState, pauseUntil } from './agentPause';

describe('pausa do agente na conversa', () => {
  const now = new Date('2026-11-20T15:00:00Z');
  test('opções de pausa', () => {
    expect(pauseUntil('2h', now).toISOString()).toBe('2026-11-20T17:00:00.000Z');
    expect(pauseUntil('24h', now).toISOString()).toBe('2026-11-21T15:00:00.000Z');
    expect(pauseUntil('until_resume', now).getUTCFullYear()).toBe(2100);
  });
  test('estado', () => {
    expect(agentPauseState(null, now).paused).toBe(false);
    expect(agentPauseState('2026-11-20T14:00:00Z', now).paused).toBe(false); // já passou
    expect(agentPauseState('2100-01-01T00:00:00Z', now)).toEqual({ paused: true, label: 'até reativar' });
    expect(agentPauseState('2026-11-20T17:00:00Z', now).paused).toBe(true);
  });
});
