import { supabase } from '@/integrations/supabase/client';

/**
 * Grava a leitura da conversa no servidor via `rpc_mark_thread_read`.
 *
 * A RPC resolve o usuário por `current_user_id()`, faz o upsert em
 * `message_thread_reads` e informa a origem — o que permite ao servidor
 * enfileirar o aviso silencioso de leitura para os outros aparelhos do usuário
 * (push `read_sync`), sem avisar o aparelho que já leu.
 *
 * Fallback: se a RPC falhar por qualquer motivo, cai no upsert direto — o mesmo
 * caminho usado antes e ainda usado pelo app publicado — para nunca perder o
 * controle de não lidas.
 *
 * @returns true quando essa leitura realmente zerou mensagens não lidas.
 */
export async function markThreadReadRemote(
  threadId: string,
  userId: string | null | undefined,
  source: 'web' | 'mobile' = 'web',
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('rpc_mark_thread_read' as never, {
      p_thread_id: threadId,
      p_source: source,
    } as never);
    if (error) throw error;
    return data === true;
  } catch (err) {
    console.warn('[markThreadRead] rpc failed, falling back to upsert', err);
    if (!userId) return false;
    await supabase
      .from('message_thread_reads' as never)
      .upsert(
        { thread_id: threadId, user_id: userId, last_read_at: new Date().toISOString() } as never,
        { onConflict: 'thread_id,user_id' },
      );
    return false;
  }
}
