import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flag, Plus } from '@phosphor-icons/react';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  organization_ids: string[];
  created_at: string;
}

interface OrganizationOption {
  id: string;
  name: string;
  slug: string;
}

export default function AdminFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFlag, setNewFlag] = useState({ name: '', description: '' });
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [scopeFlag, setScopeFlag] = useState<FeatureFlag | null>(null);
  const [scopeOrganizationIds, setScopeOrganizationIds] = useState<string[]>([]);
  const [scopeIsGlobal, setScopeIsGlobal] = useState(false);
  const [savingScope, setSavingScope] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchFlags();
    fetchOrganizations();
  }, []);

  const fetchFlags = async () => {
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFlags(data || []);
    } catch (error) {
      console.error('Error fetching flags:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar feature flags.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOrganizations = async () => {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .order('name');

    if (error) {
      console.error('Error fetching organizations:', error);
      return;
    }
    setOrganizations(data || []);
  };

  const openScopeDialog = (flag: FeatureFlag) => {
    setScopeFlag(flag);
    setScopeOrganizationIds(flag.organization_ids || []);
    setScopeIsGlobal((flag.organization_ids || []).length === 0);
  };

  const handleSaveScope = async () => {
    if (!scopeFlag) return;
    if (!scopeIsGlobal && scopeOrganizationIds.length === 0) {
      toast({
        title: 'Selecione uma organização',
        description: 'Escolha ao menos uma organização ou marque o escopo global.',
        variant: 'destructive',
      });
      return;
    }

    setSavingScope(true);
    try {
      const { error } = await supabase
        .from('feature_flags')
        .update({ organization_ids: scopeIsGlobal ? [] : scopeOrganizationIds })
        .eq('id', scopeFlag.id);

      if (error) throw error;
      await fetchFlags();
      setScopeFlag(null);
      toast({
        title: 'Escopo atualizado',
        description: scopeIsGlobal
          ? 'A flag será aplicada globalmente quando estiver ativa.'
          : `A flag foi limitada a ${scopeOrganizationIds.length} organização(ões).`,
      });
    } catch (error) {
      console.error('Error updating feature flag scope:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar o escopo da feature flag.',
        variant: 'destructive',
      });
    } finally {
      setSavingScope(false);
    }
  };

  const handleToggleFlag = async (flagId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('feature_flags')
        .update({ is_enabled: !currentStatus })
        .eq('id', flagId);

      if (error) throw error;

      await fetchFlags();
      toast({
        title: 'Flag atualizada',
        description: `Feature flag ${!currentStatus ? 'ativada' : 'desativada'} com sucesso.`,
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar feature flag.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateFlag = async () => {
    if (!newFlag.name.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome da feature flag é obrigatório.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('feature_flags')
        .insert({
          name: newFlag.name,
          description: newFlag.description || null,
          is_enabled: false,
          organization_ids: [],
        });

      if (error) throw error;

      await fetchFlags();
      setCreateDialogOpen(false);
      setNewFlag({ name: '', description: '' });
      
      toast({
        title: 'Feature flag criada',
        description: 'Nova feature flag criada com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao criar feature flag.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Feature Flags</h1>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Flag
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Todas as Feature Flags ({flags.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Organizações</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flags.map((flag) => (
                  <TableRow key={flag.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Flag className="h-4 w-4" />
                        {flag.name}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {flag.description || '-'}
                    </TableCell>
                    <TableCell>
                      {flag.organization_ids.length > 0 ? (
                        <Badge variant="secondary">
                          {flag.organization_ids.length} org(s)
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Global</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {flag.is_enabled ? (
                        <Badge variant="default">Ativa</Badge>
                      ) : (
                        <Badge variant="secondary">Inativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Button variant="outline" size="sm" onClick={() => openScopeDialog(flag)}>
                          Escopo
                        </Button>
                        <Switch
                          checked={flag.is_enabled}
                          onCheckedChange={() => handleToggleFlag(flag.id, flag.is_enabled)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Feature Flag</DialogTitle>
              <DialogDescription>
                Crie uma nova feature flag para controlar funcionalidades.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  placeholder="ex: new_dashboard_ui"
                  value={newFlag.name}
                  onChange={(e) => setNewFlag({ ...newFlag, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva o que essa flag controla..."
                  value={newFlag.description}
                  onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateFlag}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!scopeFlag} onOpenChange={(open) => !open && setScopeFlag(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Escopo de {scopeFlag?.name}</DialogTitle>
              <DialogDescription>
                Defina quais organizações receberão a funcionalidade quando a flag estiver ativa.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border p-3">
                <Switch
                  id="feature-flag-global-scope"
                  checked={scopeIsGlobal}
                  onCheckedChange={setScopeIsGlobal}
                />
                <Label htmlFor="feature-flag-global-scope">Todas as organizações</Label>
              </div>

              {!scopeIsGlobal && (
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
                  {organizations.map((organization) => {
                    const checked = scopeOrganizationIds.includes(organization.id);
                    return (
                      <label
                        key={organization.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(nextChecked) => {
                            setScopeOrganizationIds((current) => nextChecked
                              ? [...current, organization.id]
                              : current.filter((id) => id !== organization.id));
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{organization.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{organization.slug}</span>
                        </span>
                      </label>
                    );
                  })}
                  {organizations.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma organização disponível.</p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setScopeFlag(null)} disabled={savingScope}>
                Cancelar
              </Button>
              <Button onClick={handleSaveScope} disabled={savingScope}>
                {savingScope ? 'Salvando...' : 'Salvar escopo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
