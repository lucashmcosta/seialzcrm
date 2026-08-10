import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, LinkSimple } from "@phosphor-icons/react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { MetaConnectionInfo } from "@/hooks/useMetaConnection";

// Painel read-only exibido nas capabilities quando a credencial canônica está ativa
// (flag ligada + Meta Connection conectada). A capability NÃO gerencia auth própria:
// a credencial é resolvida server-side pela Meta Connection. A gestão da conexão em si
// (conectar/reconectar/assets) fica na aba "Conexão" da página Meta.
export function CanonicalCredentialPanel({
  connection,
  note,
}: {
  connection: MetaConnectionInfo | null;
  note?: string;
}) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1 w-fit">
          <LinkSimple className="h-3 w-3" />
          Credencial: Meta Connection (canônica)
        </Badge>
        <Badge variant="outline" className="gap-1 w-fit">
          <CheckCircle className="h-3 w-3 text-green-500" />
          Conectado
        </Badge>
      </div>

      <div className="grid gap-2 text-sm">
        {connection?.authorizing_meta_user_name && (
          <div>
            <span className="text-xs text-muted-foreground">Autorizado por</span>
            <p className="font-medium">{connection.authorizing_meta_user_name}</p>
          </div>
        )}
        {connection?.token_type && (
          <div>
            <span className="text-xs text-muted-foreground">Tipo de token</span>
            <p className="font-mono text-xs">{connection.token_type}</p>
          </div>
        )}
        {connection?.last_token_check_at && (
          <div>
            <span className="text-xs text-muted-foreground">Última verificação de saúde</span>
            <p className="text-xs">
              {format(new Date(connection.last_token_check_at), "dd/MM/yyyy 'às' HH:mm", {
                locale: ptBR,
              })}
              {connection.last_health ? ` · ${connection.last_health}` : ""}
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {note ??
          "Esta integração usa a credencial da Meta Connection. Para conectar, reconectar ou gerenciar ativos, use a aba “Conexão” da integração Meta."}
      </p>
    </Card>
  );
}
