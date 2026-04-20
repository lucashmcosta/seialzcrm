import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { toast } from '@/hooks/use-toast';
import { Plus, PencilSimple, TrashSimple, Eye, PencilLine, Trash, Shield, Gear, UsersThree } from '@phosphor-icons/react';

interface PermissionProfile {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
}

type PermissionDef = {
  key: string;
  label: string;
  description: string;
};

type PermissionGroup = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  permissions: PermissionDef[];
};

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Visualização',
    description: 'O que o usuário pode ver no sistema',
    icon: Eye,
    permissions: [
      { key: 'can_view_contacts', label: 'Ver Contatos', description: 'Acessar o módulo de contatos (apenas os atribuídos a ele)' },
      { key: 'can_view_opportunities', label: 'Ver Oportunidades', description: 'Acessar o Kanban e oportunidades (apenas as atribuídas a ele)' },
    ],
  },
  {
    title: 'Acesso Amplo (ver dados de toda a equipe)',
    description: 'Permite ver registros de outros usuários quando a privacidade está ativa',
    icon: UsersThree,
    permissions: [
      { key: 'view_all_contacts', label: 'Ver TODOS os Contatos', description: 'Acessa contatos de todos os usuários da organização' },
      { key: 'view_all_opportunities', label: 'Ver TODAS as Oportunidades', description: 'Visualiza o Kanban completo, incluindo oportunidades de outros vendedores' },
      { key: 'view_all_threads', label: 'Ver TODAS as Conversas', description: 'Acessa conversas de WhatsApp de toda a equipe' },
    ],
  },
  {
    title: 'Edição',
    description: 'O que o usuário pode criar e modificar',
    icon: PencilLine,
    permissions: [
      { key: 'can_edit_contacts', label: 'Editar Contatos', description: 'Criar e modificar contatos' },
      { key: 'can_edit_opportunities', label: 'Editar Oportunidades', description: 'Criar e modificar oportunidades, mover no Kanban' },
    ],
  },
  {
    title: 'Exclusão',
    description: 'Permissões destrutivas — conceda com cuidado',
    icon: Trash,
    permissions: [
      { key: 'can_delete_contacts', label: 'Excluir Contatos', description: 'Apagar contatos (envia para lixeira)' },
      { key: 'can_delete_opportunities', label: 'Excluir Oportunidades', description: 'Apagar oportunidades (envia para lixeira)' },
    ],
  },
  {
    title: 'Atribuições',
    description: 'Controle sobre distribuição de leads e responsáveis',
    icon: Shield,
    permissions: [
      { key: 'manage_assignments', label: 'Gerenciar Atribuições', description: 'Reatribuir contatos, oportunidades e conversas para outros usuários' },
    ],
  },
  {
    title: 'Administração',
    description: 'Configurações globais da organização',
    icon: Gear,
    permissions: [
      { key: 'can_manage_users', label: 'Gerenciar Usuários', description: 'Convidar, criar e desativar usuários; criar perfis de permissão' },
      { key: 'can_manage_settings', label: 'Gerenciar Configurações', description: 'Acessar configurações gerais, pipelines, tags, campos customizados' },
      { key: 'can_manage_integrations', label: 'Gerenciar Integrações', description: 'Conectar/desconectar WhatsApp, Twilio, Kommo e demais integrações' },
      { key: 'can_manage_billing', label: 'Gerenciar Cobrança', description: 'Ver e alterar plano, métodos de pagamento e faturas' },
    ],
  },
];

const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

const buildDefaultPermissions = (): Record<string, boolean> =>
  Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, false]));

export function PermissionProfilesSettings() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const [profiles, setProfiles] = useState<PermissionProfile[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PermissionProfile | null>(null);
  const [profileName, setProfileName] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>(buildDefaultPermissions());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (organization) fetchProfiles();
  }, [organization]);

  const fetchProfiles = async () => {
    if (!organization) return;
    const { data } = await supabase
      .from('permission_profiles')
      .select('*')
      .eq('organization_id', organization.id)
      .order('name');
    if (data) setProfiles(data as any);
  };

  const handleOpenDialog = (profile?: PermissionProfile) => {
    if (profile) {
      setEditingProfile(profile);
      setProfileName(profile.name);
      setPermissions({ ...buildDefaultPermissions(), ...(profile.permissions || {}) });
    } else {
      setEditingProfile(null);
      setProfileName('');
      setPermissions(buildDefaultPermissions());
    }
    setDialogOpen(true);
  };

  const togglePermission = (key: string, value: boolean) => {
    setPermissions((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-cascata: se ativar "ver todos", garante que "ver" base também esteja ligado
      if (value && key === 'view_all_contacts') next.can_view_contacts = true;
      if (value && key === 'view_all_opportunities') next.can_view_opportunities = true;
      // Editar/excluir exigem ver
      if (value && key === 'can_edit_contacts') next.can_view_contacts = true;
      if (value && key === 'can_delete_contacts') {
        next.can_view_contacts = true;
        next.can_edit_contacts = true;
      }
      if (value && key === 'can_edit_opportunities') next.can_view_opportunities = true;
      if (value && key === 'can_delete_opportunities') {
        next.can_view_opportunities = true;
        next.can_edit_opportunities = true;
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!organization || !profileName.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Dê um nome ao perfil.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const profileData = {
        organization_id: organization.id,
        name: profileName.trim(),
        permissions,
      };

      if (editingProfile) {
        const { error } = await supabase
          .from('permission_profiles')
          .update(profileData)
          .eq('id', editingProfile.id);
        if (error) throw error;
        toast({ title: 'Perfil atualizado' });
      } else {
        const { error } = await supabase.from('permission_profiles').insert([profileData]);
        if (error) throw error;
        toast({ title: 'Perfil criado' });
      }

      setDialogOpen(false);
      fetchProfiles();
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (profileId: string) => {
    setDeletingId(profileId);
    setConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('permission_profiles').delete().eq('id', deletingId);
      if (error) throw error;
      toast({ title: 'Perfil excluído' });
      fetchProfiles();
    } catch (error: any) {
      console.error('Error deleting profile:', error);
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setDeletingId(null);
    }
  };

  const countActive = (perms: Record<string, boolean> | undefined) =>
    Object.entries(perms || {}).filter(([, v]) => v).length;

  const hasGlobalAccess = (perms: Record<string, boolean> | undefined) =>
    !!(perms?.view_all_contacts || perms?.view_all_opportunities || perms?.view_all_threads);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Perfis de Permissão</CardTitle>
              <CardDescription>
                Crie perfis customizados (ex: "Gerente Comercial", "Atendente", "Supervisor") e defina exatamente o que cada um pode acessar.
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Perfil
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {profiles.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum perfil criado ainda.
              </p>
            )}
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{profile.name}</h3>
                    {hasGlobalAccess(profile.permissions) && (
                      <Badge variant="secondary" className="text-xs">
                        <UsersThree className="h-3 w-3 mr-1" />
                        Acesso amplo
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {countActive(profile.permissions)} permissões ativas
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleOpenDialog(profile)}>
                    <PencilSimple className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteClick(profile.id)}>
                    <TrashSimple className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProfile ? 'Editar Perfil de Permissão' : 'Novo Perfil de Permissão'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <Label htmlFor="profileName">Nome do Perfil</Label>
              <Input
                id="profileName"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Ex: Gerente Comercial, Atendente Sênior, Supervisor..."
              />
            </div>

            {PERMISSION_GROUPS.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.title} className="space-y-3 pt-4 border-t first:border-t-0 first:pt-0">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-2 rounded-md bg-muted">
                      <Icon className="h-4 w-4 text-foreground" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium">{group.title}</h3>
                      <p className="text-sm text-muted-foreground">{group.description}</p>
                    </div>
                  </div>
                  <div className="space-y-3 pl-12">
                    {group.permissions.map((perm) => (
                      <div key={perm.key} className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <Label htmlFor={perm.key} className="cursor-pointer font-normal">
                            {perm.label}
                          </Label>
                          <p className="text-xs text-muted-foreground mt-0.5">{perm.description}</p>
                        </div>
                        <Switch
                          id={perm.key}
                          checked={!!permissions[perm.key]}
                          onCheckedChange={(checked) => togglePermission(perm.key, checked)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir Perfil de Permissão"
        description="Tem certeza que deseja excluir este perfil? Usuários associados a este perfil perderão suas permissões e precisarão ser reatribuídos."
        confirmText="Excluir"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleting}
      />
    </>
  );
}
