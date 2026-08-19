/**
 * HARNESS TEMPORÁRIO (a ser removido) — replica a árvore de layout do painel
 * esquerdo de /commercial para medir o rodapé "Carregar mais" com e sem o
 * preview da última mensagem. Nenhum dado real, nenhuma paginação real.
 */
import { ListBox, ListBoxItem } from 'react-aria-components';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { LastMessagePreview } from '@/components/messages/LastMessagePreview';
import { cn } from '@/lib/utils';

const THREADS = Array.from({ length: 50 }, (_, i) => ({
  id: `t-${i}`,
  name: `Contato Numero ${i} da Central Trabalhista`,
  last:
    i % 3 === 0
      ? 'Bom dia, gostaria de saber como funciona o processo de analise e quais documentos preciso enviar para dar entrada hoje mesmo'
      : i % 3 === 1
        ? '[Áudio]'
        : 'Obrigado pelo retorno, vou providenciar',
  direction: i % 2 === 0 ? 'outbound' : 'inbound',
}));

export default function DevListAB() {
  const withPreview = !new URLSearchParams(window.location.search).has('nopreview');

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-[68px] shrink-0 border-r border-border" />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="h-screen overflow-hidden flex">
              <div
                id="ab-panel"
                className="w-[400px] flex-shrink-0 border-r border-border flex flex-col bg-card h-full overflow-hidden"
              >
                <div className="p-4 border-b border-border">
                  <h1 className="text-xl font-semibold text-foreground">Comercial (harness)</h1>
                  <div className="h-10 mt-4 rounded bg-muted" />
                  <div className="h-7 mt-3 rounded bg-muted" />
                </div>
                <ScrollArea className="flex-1">
                  <>
                    <ListBox aria-label="Conversations" selectionMode="single">
                      {THREADS.map((thread) => (
                        <ListBoxItem
                          key={thread.id}
                          id={thread.id}
                          textValue={thread.name}
                          className="ab-item group relative flex items-center gap-3 border-b border-border/60 py-2.5 px-3 select-none cursor-pointer"
                        >
                          <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-semibold text-sm text-foreground truncate">
                                  {thread.name}
                                </span>
                              </div>
                              <span className="shrink-0 text-[11px] text-muted-foreground leading-5">
                                2h
                              </span>
                            </div>
                            {withPreview && (
                              <LastMessagePreview
                                className="ab-preview mt-0.5"
                                content={thread.last}
                                direction={thread.direction}
                                mediaType={null}
                                whatsappStatus={thread.direction === 'outbound' ? 'read' : null}
                              />
                            )}
                            <div className="flex items-center gap-1.5 mt-1 min-w-0">
                              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0 bg-green-500')} />
                              <span className="text-[10px] font-medium shrink-0 text-green-700">
                                Aberta
                              </span>
                            </div>
                          </div>
                        </ListBoxItem>
                      ))}
                    </ListBox>
                    <div id="ab-footer" className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground"
                      >
                        Carregar mais
                      </Button>
                    </div>
                  </>
                </ScrollArea>
              </div>
              <div className="flex-1 bg-background" />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
