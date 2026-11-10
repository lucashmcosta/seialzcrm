import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import type { LossOptions } from '@/lib/lossReasons';
import type { LossChoice } from './useLossOptions';

const NONE = '__none__';

interface Props {
  options: LossOptions;
  value: LossChoice;
  onChange: (value: LossChoice) => void;
  disabled?: boolean;
}

/** Motivo → detalhe (com texto de ajuda) → descrição. Usado ao marcar a perda e ao corrigir o motivo. */
export function LossChoiceFields({ options, value, onChange, disabled }: Props) {
  useUiLocale();
  const reason = options.reasons.find((r) => r.id === value.reasonId) ?? null;
  const detail = reason?.details.find((d) => d.id === value.detailId) ?? null;
  const showDetail = !!reason && options.detail_mode !== 'off' && reason.details.length > 0;
  const detailRequired = showDetail && options.detail_mode === 'required';
  const descriptionRequired = !!detail?.requires_description;

  if (options.reasons.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>
          {uiText('Motivo')}
          {options.reason_required && <span className="ml-1 text-destructive">*</span>}
        </Label>
        <Select value={value.reasonId ?? NONE} disabled={disabled}
          onValueChange={(v) => onChange({ ...value, reasonId: v === NONE ? null : v, detailId: null })}>
          <SelectTrigger><SelectValue placeholder={uiText('Escolha o motivo')} /></SelectTrigger>
          <SelectContent>
            {!options.reason_required && <SelectItem value={NONE}>{uiText('Sem motivo')}</SelectItem>}
            {options.reason_required && !value.reasonId && <SelectItem value={NONE} disabled>{uiText('Escolha o motivo')}</SelectItem>}
            {options.reasons.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showDetail && reason && (
        <div className="space-y-2">
          <Label>
            {uiText('Detalhe')}
            {detailRequired && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Select value={value.detailId ?? NONE} disabled={disabled}
            onValueChange={(v) => onChange({ ...value, detailId: v === NONE ? null : v })}>
            <SelectTrigger><SelectValue placeholder={uiText('Escolha o detalhe')} /></SelectTrigger>
            <SelectContent>
              {detailRequired
                ? !value.detailId && <SelectItem value={NONE} disabled>{uiText('Escolha o detalhe')}</SelectItem>
                : <SelectItem value={NONE}>{uiText('Sem detalhe')}</SelectItem>}
              {reason.details.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {detail?.help_text && <p className="text-xs text-muted-foreground">{detail.help_text}</p>}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="loss-description">
          {uiText('Descrição')}
          {descriptionRequired
            ? <span className="ml-1 text-destructive">*</span>
            : <span className="ml-1 text-xs font-normal text-muted-foreground">({uiText('opcional')})</span>}
        </Label>
        <Textarea id="loss-description" value={value.description} maxLength={2000} disabled={disabled} rows={3}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          placeholder={uiText('O que aconteceu')} />
      </div>
    </div>
  );
}
