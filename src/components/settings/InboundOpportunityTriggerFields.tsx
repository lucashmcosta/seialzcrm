import { uiText, useUiLocale } from '@/lib/ui-locale';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

/** Mesmos valores de supabase/functions/_shared/inbound-opportunity.ts. */
export type OpportunityTrigger = 'new_contact' | 'no_open_opportunity';

export interface OpportunityTriggerSettings {
  opportunity_trigger?: OpportunityTrigger | null;
  reopen_skip_won_days?: number | null;
}

interface Props {
  value: OpportunityTriggerSettings;
  onChange: (patch: OpportunityTriggerSettings) => void;
  disabled?: boolean;
}

/** Quando a mensagem recebida cria oportunidade: só contato novo, ou qualquer contato sem oportunidade aberta. */
export function InboundOpportunityTriggerFields({ value, onChange, disabled }: Props) {
  useUiLocale();
  const trigger: OpportunityTrigger = value.opportunity_trigger === 'no_open_opportunity' ? 'no_open_opportunity' : 'new_contact';

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-sm">{uiText("Quando criar")}</Label>
        <select
          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={trigger}
          onChange={(e) => onChange({ opportunity_trigger: e.target.value as OpportunityTrigger })}
          disabled={disabled}
        >
          <option value="new_contact">{uiText("Só para contato novo")}</option>
          <option value="no_open_opportunity">{uiText("Sempre que o contato não tiver oportunidade aberta")}</option>
        </select>
        <p className="text-xs text-muted-foreground">
          {trigger === 'new_contact'
            ? uiText("Contato que já existe e volta a falar não ganha oportunidade.")
            : uiText("Inclui contato antigo que volta a falar e quem já teve oportunidade ganha ou perdida.")}
        </p>
      </div>

      {trigger === 'no_open_opportunity' && (
        <div className="space-y-2">
          <Label className="text-sm">{uiText("Não criar se ganhou uma oportunidade nos últimos (dias)")}</Label>
          <Input
            type="number"
            min={0}
            max={3650}
            inputMode="numeric"
            className="h-9 w-32 text-sm"
            placeholder="0"
            value={value.reopen_skip_won_days ? String(value.reopen_skip_won_days) : ''}
            onChange={(e) => {
              const n = Math.min(3650, Math.max(0, Math.floor(Number(e.target.value) || 0)));
              onChange({ reopen_skip_won_days: n || null });
            }}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            {uiText("Evita oportunidade nova quando o cliente que acabou de comprar manda mensagem. Vazio ou 0: sem carência.")}
          </p>
        </div>
      )}
    </div>
  );
}
