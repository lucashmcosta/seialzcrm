// Escolha do Pixel da Conversions API com a conexão Meta ativa: lista os Pixels das contas
// de anúncio selecionadas em Ativos. Digitar o ID segue possível (ex.: Pixel que não está
// ligado à conta de anúncio, ou quando a Meta não respondeu).
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uiText, useUiLocale } from '@/lib/ui-locale';

export type PixelOption = {
  id: string;
  name: string | null;
  ad_account_name: string | null;
  has_fired: boolean;
};

export type PixelListResponse = {
  reason?: 'no_connection' | 'no_ad_account' | 'meta_error' | null;
  failed_accounts?: number;
  pixels: PixelOption[];
  defaults?: { page_id?: string | null; whatsapp_business_account_id?: string | null };
};

export function MetaPixelPicker({
  value,
  onChange,
  error,
  loading,
  failed,
  data,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string;
  loading: boolean;
  failed: boolean;
  data?: PixelListResponse;
}) {
  useUiLocale();
  const pixels = data?.pixels ?? [];
  const valueInList = pixels.some((p) => p.id === value);
  const [typing, setTyping] = useState(false);
  // Sem lista, ou com um Pixel salvo que não está nela: abre direto no campo de ID.
  const manual = typing || (!loading && (pixels.length === 0 || (!!value && !valueInList)));

  useEffect(() => { setTyping(false); }, [data]);

  const message = failed || data?.reason === 'meta_error'
    ? uiText('Não foi possível buscar os Pixels na Meta agora. Digite o ID ou tente de novo em instantes.')
    : data?.reason === 'no_ad_account'
      ? uiText('Selecione uma conta de anúncio na aba Ativos para listar os Pixels.')
      : data?.reason === 'no_connection'
        ? uiText('Conexão com a Meta indisponível. Verifique a aba Conexão.')
        : pixels.length === 0
          ? uiText('Nenhum Pixel encontrado nas contas de anúncio selecionadas. Crie um no Gerenciador de Eventos ou digite o ID.')
          : (data?.failed_accounts ?? 0) > 0
            ? uiText('Algumas contas de anúncio não responderam, então a lista pode estar incompleta.')
            : null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="pixel_id">Pixel *</Label>
      {loading ? (
        <Skeleton className="h-10 w-full" />
      ) : manual ? (
        <Input
          id="pixel_id"
          value={value}
          inputMode="numeric"
          placeholder={uiText('ID do Pixel')}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Select value={valueInList ? value : undefined} onValueChange={onChange}>
          <SelectTrigger id="pixel_id">
            <SelectValue placeholder={uiText('Escolha o Pixel')} />
          </SelectTrigger>
          <SelectContent>
            {pixels.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name || p.id}
                <span className="ml-2 text-xs text-muted-foreground">
                  {p.id}{p.has_fired ? '' : ` · ${uiText('ainda sem eventos')}`}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {message && !loading && <p className="text-xs text-muted-foreground">{message}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!loading && pixels.length > 0 && (
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => {
            if (manual && !valueInList) onChange('');
            setTyping(!manual);
          }}
        >
          {manual ? uiText('Escolher da lista') : uiText('Digitar o ID manualmente')}
        </button>
      )}
    </div>
  );
}
