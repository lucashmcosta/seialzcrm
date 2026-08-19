import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListBox, ListBoxItem } from "react-aria-components";
import { Button } from "@/components/ui/button";
import { LastMessagePreview } from "@/components/messages/LastMessagePreview";

// TEMP dev harness to validate list geometry + pagination. Not linked in nav.
const LONG = "Olá, bom dia! Gostaria de saber se ainda é possível enviar a documentação do processo de cidadania italiana hoje mesmo, porque recebi o e-mail ontem à noite";

export default function DevListAB() {
  const [count, setCount] = useState(50);
  const preview = !new URLSearchParams(window.location.search).has("nopreview");
  const items = Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Contato ${i + 1}` }));
  const hasMore = count < 150;

  return (
    <div className="h-screen flex overflow-hidden">
      <div className="w-[400px] flex flex-col border-r overflow-hidden">
        <div className="h-14 border-b flex items-center px-4 text-sm">Conversas</div>
        <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
          <ListBox aria-label="Conversations" selectionMode="single" items={items} className="outline-none">
            {(item: { id: string; name: string }) => (
              <ListBoxItem id={item.id} textValue={item.name} className="px-4 py-3 border-b flex gap-3 cursor-pointer">
                <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{item.name}</div>
                  {preview && (
                    <LastMessagePreview
                      content={LONG}
                      direction="outbound"
                      mediaType={null}
                      whatsappStatus="read"
                    />
                  )}
                </div>
              </ListBoxItem>
            )}
          </ListBox>
          {hasMore && (
            <div className="p-4 text-center">
              <Button data-testid="show-more" variant="outline" size="sm" onClick={() => setCount((c) => c + 50)}>
                Carregar mais
              </Button>
            </div>
          )}
        </ScrollArea>
      </div>
      <div className="flex-1" />
    </div>
  );
}
