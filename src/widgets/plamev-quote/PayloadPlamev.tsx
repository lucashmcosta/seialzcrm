import { Copy } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { ChamadaPlamev } from './api';

type Chamada = ChamadaPlamev & { titulo: string };

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Payload trocado com a API da Plamev (sem o token), para testar com o time da Plamev. */
export function PayloadPlamev({ chamadas }: { chamadas: Chamada[] }) {
  const copiar = async (valor: unknown, oQue: string) => {
    await navigator.clipboard.writeText(json(valor));
    toast({ title: `${oQue} copiado` });
  };

  return (
    <details className="rounded-[6px] border border-border p-3 text-xs">
      <summary className="cursor-pointer text-muted-foreground">Ver payload enviado à Plamev</summary>
      <div className="mt-3 space-y-4">
        {chamadas.map((c, i) => (
          <div key={`${c.titulo}-${i}`} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-foreground">
                {c.titulo}{' '}
                <span className={c.status >= 400 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}>
                  HTTP {c.status}
                </span>{' '}
                <span className="text-muted-foreground">· {c.ms} ms</span>
              </div>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                onClick={() => copiar({ metodo: c.metodo, url: c.url, status: c.status, enviado: c.enviado, recebido: c.recebido }, 'Payload')}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copiar tudo
              </Button>
            </div>
            <div className="break-all font-data text-muted-foreground">{c.metodo} {c.url}</div>
            <Bloco titulo="Enviado" valor={c.enviado} onCopiar={() => copiar(c.enviado, 'Enviado')} />
            <Bloco titulo="Resposta" valor={c.recebido} onCopiar={() => copiar(c.recebido, 'Resposta')} />
          </div>
        ))}
        <p className="text-muted-foreground">O token não aparece aqui: vai só no cabeçalho, do servidor para a Plamev.</p>
      </div>
    </details>
  );
}

function Bloco({ titulo, valor, onCopiar }: { titulo: string; valor: unknown; onCopiar: () => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{titulo}</span>
        <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={onCopiar}>copiar</button>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre rounded-[6px] bg-muted/60 p-2 font-data text-[11px] leading-snug">
        {valor == null ? '(vazio)' : typeof valor === 'string' ? valor : json(valor)}
      </pre>
    </div>
  );
}
