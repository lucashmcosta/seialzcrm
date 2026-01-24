import { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Briefcase, AlertTriangle, ArrowRight } from 'lucide-react';

import type { KommoCredentials, MigrationConfig } from '@/hooks/useKommoMigration';

interface KommoPreviewStepProps {
  credentials: KommoCredentials;
  config: MigrationConfig;
  onConfigChange: (config: MigrationConfig) => void;
  previewMutation: any;
}

export function KommoPreviewStep({
  credentials,
  config,
  onConfigChange,
  previewMutation,
}: KommoPreviewStepProps) {
  useEffect(() => {
    if (credentials && !previewMutation.data && !previewMutation.isPending) {
      previewMutation.mutate(credentials);
    }
  }, [credentials]);

  if (previewMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Buscando dados do Kommo...</p>
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

  const totalRecords = (preview.total_contacts_number || 0) + (preview.total_leads_number || 0);
  const isLargeImport = totalRecords > 5000;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{preview.total_contacts}</p>
              <p className="text-sm text-muted-foreground">Contatos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{preview.total_leads}</p>
              <p className="text-sm text-muted-foreground">Leads/Oportunidades</p>
            </div>
          </div>
        </Card>
      </div>

      {isLargeImport && (
        <Alert className="border-yellow-500/50 bg-yellow-500/5">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle>Importação grande</AlertTitle>
          <AlertDescription>
            Você tem mais de 5.000 registros. A migração pode levar vários minutos.
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
