// Campo com texto pronto para copiar (links, parâmetros, código de instalação).
import { useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { uiText } from '@/lib/ui-locale';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(uiText('Não foi possível copiar. Selecione o texto e copie.'));
    }
  };
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md border bg-muted/40 px-3 py-2 text-xs">{value}</code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          <span className="ml-1">{copied ? uiText('Copiado') : uiText('Copiar')}</span>
        </Button>
      </div>
    </div>
  );
}
