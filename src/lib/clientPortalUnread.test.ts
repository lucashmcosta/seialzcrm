// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { zeroConversationUnread } from './clientPortalUnread';

const conv = (id: string, n: number) => ({ conversationId: id, unreadForStaff: n }) as any;

describe('zeroConversationUnread', () => {
  it('zera só a conversa lida', () => {
    const data = { pageParams: [undefined], pages: [{ items: [conv('a', 3), conv('b', 2)] }] } as any;
    const out = zeroConversationUnread(data, 'a')!;
    expect(out.pages[0].items[0].unreadForStaff).toBe(0);
    expect(out.pages[0].items[1].unreadForStaff).toBe(2);
  });
});
