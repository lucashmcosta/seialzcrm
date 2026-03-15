import { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  SpinnerGap, Users, Briefcase, Warning, ArrowRight, 
  Buildings, ListChecks, Note, CalendarBlank, Sliders, Clock 
} from '@phosphor-icons/react';

import type { KommoCredentials, MigrationConfig } from '@/hooks/useKommoMigration';

interface KommoPreviewStepProps {
  credentials: KommoCredentials;
  config: MigrationConfig;
  onConfigChange: (config: MigrationConfig) => void;
  previewMutation: any;
  selectedPipelineNames?: string[];
}

export function KommoPreviewStep({
  credentials,
  config,
  onConfigChange,
  previewMutation,
  selectedPipelineNames,
}: KommoPreviewStepProps) {
  useEffect(() => {
    if (credentials && !previewMutation.data && !previewMutation.isPending) {
      previewMutation.mutate(credentials);
    }
  }, [credentials]);

  if (previewMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <SpinnerGap className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Contando registros... isso pode levar alguns segundos</p>
      </div>
    );
  }

  if (previewMutation.isError) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Erro ao buscar preview: {previewMutation.error?.message}</p>
      </div>
    );
  }

  const preview = previewMutation.data;
  if (!preview) return null;

  const contactsCount = preview.total_contacts || 0;
  const leadsCount = preview.total_leads || 0;
  const companiesCount = preview.total_companies || 0;
  const tasksCount = preview.total_tasks || 0;
  const notesCount = preview.total_notes || 0;
  const eventsCount = 0; // Events counted during migration
  const customFieldsCount = preview.total_custom_fields || 0;

  const selectedTotal = contactsCount + leadsCount 
    + (config.import_companies ? companiesCount : 0)
    + (config.import_tasks ? tasksCount : 0)
    + (config.import_notes ? notesCount : 0)
    + (config.import_events ? eventsCount : 0);

  // Rough time estimate: ~100 records/sec
  const estimatedMinutes = Math.max(1, Math.ceil(selectedTotal / 100 / 60));
  const isLargeImport = selectedTotal > 5000;

  const counters = [
    { icon: Users, label: 'Contatos', count: contactsCount, always: true },
    { icon: Briefcase, label: 'Oportunidades', count: leadsCount, always: true },
    { icon: Buildings, label: 'Empresas', count: companiesCount, configKey: 'import_companies' as const },
    { icon: ListChecks, label: 'Tarefas', count: tasksCount, configKey: 'import_tasks' as const },
    { icon: Note, label: 'Notas', count: notesCount, configKey: 'import_notes' as const },
    { icon: CalendarBlank, label: 'Eventos', count: eventsCount, configKey: 'import_events' as const },
    { icon: Sliders, label: 'Campos custom.', count: customFieldsCount, configKey: 'import_custom_fields' as const },
  ];

  return (
    <div className="space-y-6">
      {/* Pipeline scope indicator */}
      {selectedPipelineNames && selectedPipelineNames.length > 0 && (
        <Alert className="border-primary/30 bg-primary/5">
          <Briefcase className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Dados do pipeline: <strong className="text-foreground">{selectedPipelineNames.join(', ')}</strong>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards with checkboxes */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Dados encontrados no Kommo</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {counters.map(({ icon: Icon, label, count, always, configKey }) => {
            const isEnabled = always || (configKey && config[configKey]);
            return (
              <Card
                key={label}
                className={`p-3 transition-opacity ${!isEnabled ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-lg font-bold leading-none">{count}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  </div>
                  {!always && configKey && (
                    <Checkbox
                      checked={!!config[configKey]}
                      onCheckedChange={(checked) =>
                        onConfigChange({ ...config, [configKey]: !!checked })
                      }
                      className="mt-0.5"
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Time estimate */}
      <Alert className="border-muted bg-muted/30">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <AlertDescription className="text-muted-foreground">
          <strong className="text-foreground">{selectedTotal.toLocaleString('pt-BR')}</strong> registros selecionados · 
          Tempo estimado: <strong className="text-foreground">~{estimatedMinutes} min</strong>
        </AlertDescription>
      </Alert>

      {isLargeImport && (
        <Alert className="border-yellow-500/50 bg-yellow-500/5">
          <Warning className="h-4 w-4 text-yellow-600" />
          <AlertTitle>Importação grande</AlertTitle>
          <AlertDescription>
            A migração pode levar vários minutos. Você pode fechar esta janela — o progresso continua em segundo plano.
          </AlertDescription>
        </Alert>
      )}

      {/* Sample Preview Tables */}
      {preview.sample_contacts && preview.sample_contacts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Preview de Contatos</h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome (Kommo)</TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Nome (CRM)</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.sample_contacts.slice(0, 5).map((contact: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="text-muted-foreground">{contact.kommo_name}</TableCell>
                    <TableCell><ArrowRight className="h-3 w-3 text-muted-foreground" /></TableCell>
                    <TableCell>{contact.crm_full_name}</TableCell>
                    <TableCell className="text-sm">{contact.crm_email || '-'}</TableCell>
                    <TableCell className="text-sm">{contact.crm_phone || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {preview.sample_leads && preview.sample_leads.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Preview de Leads/Oportunidades</h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome (Kommo)</TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Título (CRM)</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Contato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.sample_leads.slice(0, 5).map((lead: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="text-muted-foreground">{lead.kommo_name}</TableCell>
                    <TableCell><ArrowRight className="h-3 w-3 text-muted-foreground" /></TableCell>
                    <TableCell>{lead.crm_title}</TableCell>
                    <TableCell>
                      {lead.crm_amount > 0 ? (
                        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.crm_amount)
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-sm">{lead.contact_name || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Configuration Options */}
      <Card className="p-4 space-y-4">
        <h4 className="font-medium">Configurações da Importação</h4>

        <div className="flex items-start space-x-3">
          <Checkbox
            id="orphan_contacts"
            checked={config.import_orphan_contacts}
            onCheckedChange={(checked) =>
              onConfigChange({ ...config, import_orphan_contacts: !!checked })
            }
          />
          <div className="space-y-1">
            <Label htmlFor="orphan_contacts" className="font-normal cursor-pointer">
              Importar contatos sem leads vinculados
            </Label>
            <p className="text-xs text-muted-foreground">
              Se desmarcado, apenas contatos que possuem leads serão importados.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Tratamento de Duplicatas</Label>
          <RadioGroup
            value={config.duplicate_mode}
            onValueChange={(value: 'skip' | 'update' | 'create') =>
              onConfigChange({ ...config, duplicate_mode: value })
            }
            className="space-y-2"
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="skip" id="skip" />
              <div className="space-y-1">
                <Label htmlFor="skip" className="font-normal cursor-pointer">
                  Pular duplicatas
                  <Badge variant="secondary" className="ml-2">Recomendado</Badge>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Se um contato com mesmo email ou telefone já existir, ele será ignorado.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="update" id="update" />
              <div className="space-y-1">
                <Label htmlFor="update" className="font-normal cursor-pointer">
                  Atualizar existentes
                </Label>
                <p className="text-xs text-muted-foreground">
                  Se encontrar duplicata, atualiza os dados com as informações do Kommo.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="create" id="create" />
              <div className="space-y-1">
                <Label htmlFor="create" className="font-normal cursor-pointer">
                  Criar mesmo assim
                </Label>
                <p className="text-xs text-muted-foreground">
                  Cria novos registros mesmo que já existam duplicatas.
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>
      </Card>
    </div>
  );
}
