import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STANDARD_FIELDS = [
  { value: "full_name", label: "Nome completo" },
  { value: "first_name", label: "Primeiro nome" },
  { value: "last_name", label: "Sobrenome" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "company_name", label: "Empresa" },
  { value: "address_city", label: "Cidade" },
  { value: "address_state", label: "Estado" },
  { value: "address_street", label: "Endereço" },
  { value: "address_zip", label: "CEP" },
];

interface Props {
  question: any;
  customFields: Array<{ id: string; field_label: string; field_key: string }>;
  tags: Array<{ id: string; name: string; color?: string | null }>;
  onChange: (patch: any) => void;
}

export function QuestionMappingCard({ question, customFields, tags, onChange }: Props) {
  const strategy = question.mapping_strategy || "note";

  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="font-medium text-sm">{question.field_label}</p>
        <p className="text-[11px] text-muted-foreground">
          chave: <code>{question.field_key}</code> · tipo: {question.field_type}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Estratégia</Label>
          <Select value={strategy} onValueChange={(v) => onChange({ mapping_strategy: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="standard_field">Campo padrão do contato</SelectItem>
              <SelectItem value="custom_field">Campo personalizado</SelectItem>
              <SelectItem value="tag">Tag</SelectItem>
              <SelectItem value="note">Apenas nota</SelectItem>
              <SelectItem value="ignore">Ignorar</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {strategy === "standard_field" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Campo do contato</Label>
            <Select
              value={question.mapped_to_contact_field || ""}
              onValueChange={(v) => onChange({ mapped_to_contact_field: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {STANDARD_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {strategy === "custom_field" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Campo personalizado</Label>
            <Select
              value={question.custom_field_definition_id || ""}
              onValueChange={(v) => onChange({ custom_field_definition_id: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {customFields.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.field_label}</SelectItem>
                ))}
                {customFields.length === 0 && (
                  <SelectItem value="__none" disabled>Nenhum campo personalizado</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {strategy === "tag" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Modo da tag</Label>
              <Select
                value={question.tag_strategy || "value_as_tag"}
                onValueChange={(v) => onChange({ tag_strategy: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="value_as_tag">Resposta vira tag</SelectItem>
                  <SelectItem value="value_with_prefix">Resposta com prefixo</SelectItem>
                  <SelectItem value="fixed_tag">Tag fixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {question.tag_strategy === "value_with_prefix" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Prefixo</Label>
                <Input
                  value={question.tag_prefix || ""}
                  onChange={(e) => onChange({ tag_prefix: e.target.value })}
                  placeholder="ex: interesse:"
                />
              </div>
            )}
            {question.tag_strategy === "fixed_tag" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Tag</Label>
                <Select
                  value={question.fixed_tag_id || ""}
                  onValueChange={(v) => onChange({ fixed_tag_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {tags.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
