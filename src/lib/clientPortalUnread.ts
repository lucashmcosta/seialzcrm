import type { InfiniteData } from '@tanstack/react-query';
import type { PortalConversation } from '@/lib/clientPortalChat';

type ListPage = { items: PortalConversation[]; nextCursor?: string };

/** Zera o contador de não lidas de uma conversa na lista em cache. */
export function zeroConversationUnread(
  data: InfiniteData<ListPage> | undefined,
  conversationId: string,
): InfiniteData<ListPage> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      items: p.items.map((c) => (c.conversationId === conversationId && c.unreadForStaff !== 0
        ? { ...c, unreadForStaff: 0 } : c)),
    })),
  };
}
