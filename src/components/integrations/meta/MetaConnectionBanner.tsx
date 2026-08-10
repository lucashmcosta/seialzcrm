import { Button } from "@/components/ui/button";
import { LinkSimple } from "@phosphor-icons/react";

// Banner de topo das capabilities quando a credencial canônica está ativa: a conexão
// não é mais uma aba própria da capability — vive só na integração Meta. O botão leva
// à aba "Conexão" da integração Meta (gerir conexão/assets/reconexão).
export function MetaConnectionBanner({ onManage }: { onManage?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <LinkSimple className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Usando Meta Connection</span>
      </div>
      {onManage && (
        <Button variant="outline" size="sm" onClick={onManage}>
          Gerenciar conexão
        </Button>
      )}
    </div>
  );
}
