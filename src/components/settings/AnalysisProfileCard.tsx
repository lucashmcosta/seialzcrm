// Adapta a análise ao negócio da org. Vale para as próximas mensagens analisadas.
import { useState } from 'react';
import { X } from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { addObjection, MAX_OBJECTIONS, type AnalysisProfileForm } from '@/lib/analysisProfile';

export function AnalysisProfileCard({ value, disabled, onChange }: {
  value: AnalysisProfileForm;
  disabled: boolean;
  onChange: (next: AnalysisProfileForm) => void;
}) {
  const [draft, setDraft] = useState('');
  const isLegal = value.preset === 'juridico';

  const add = () => {
    onChange({ ...value, objections: addObjection(value.objections, draft) });
    setDraft('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Como analisar as conversas</CardTitle>
        <p className="text-sm text-muted-foreground">
          Ajuda a IA a entender o seu negócio. Vale para as próximas mensagens analisadas.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <RadioGroup
          value={value.preset}
          disabled={disabled}
          onValueChange={(v) => onChange({ ...value, preset: v as AnalysisProfileForm['preset'] })}
          className="gap-2"
        >
          <Label htmlFor="preset-geral" className="flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal">
            <RadioGroupItem id="preset-geral" value="geral" className="mt-0.5" />
            <span><span className="font-medium">Geral</span><span className="block text-xs text-muted-foreground">Para qualquer negócio, com a sua descrição e as suas objeções.</span></span>
          </Label>
          <Label htmlFor="preset-juridico" className="flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal">
            <RadioGroupItem id="preset-juridico" value="juridico" className="mt-0.5" />
            <span><span className="font-medium">Jurídico</span><span className="block text-xs text-muted-foreground">Vendas de causas trabalhistas e previdenciárias, com objeções prontas.</span></span>
          </Label>
        </RadioGroup>

        {!isLegal && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="business-description">O que sua empresa vende</Label>
              <Textarea
                id="business-description"
                rows={3}
                maxLength={1000}
                disabled={disabled}
                value={value.business_description}
                placeholder="Ex.: plano de saúde para pets, vendido pelo WhatsApp, com cobertura em clínicas credenciadas."
                onChange={(e) => onChange({ ...value, business_description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-objection">Objeções comuns no seu negócio</Label>
              <p className="text-xs text-muted-foreground">
                Preço, momento, confiança, concorrência e outras gerais já vêm incluídas. Adicione as suas, até {MAX_OBJECTIONS}.
              </p>
              {value.objections.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {value.objections.map((o) => (
                    <li key={o.key} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                      {o.label}
                      {!disabled && (
                        <button
                          type="button"
                          aria-label={`Remover ${o.label}`}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => onChange({ ...value, objections: value.objections.filter((x) => x.key !== o.key) })}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Input
                  id="new-objection"
                  value={draft}
                  maxLength={60}
                  disabled={disabled || value.objections.length >= MAX_OBJECTIONS}
                  placeholder="Ex.: Carência do plano"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                />
                <Button type="button" variant="outline" disabled={disabled || !draft.trim()} onClick={add}>Adicionar</Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
