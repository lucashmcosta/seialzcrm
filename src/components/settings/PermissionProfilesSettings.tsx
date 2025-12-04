import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Plus, Edit, Trash2 } from 'lucide-react';

interface PermissionProfile {
  id: string;
  name: string;
  permissions: any;
}

const DEFAULT_PERMISSIONS = {
  can_view_contacts: false,
  can_edit_contacts: false,
  can_delete_contacts: false,
  can_view_opportunities: false,
  can_edit_opportunities: false,
  can_delete_opportunities: false,
  can_manage_settings: false,
  can_manage_users: false,
};

export function PermissionProfilesSettings() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const [profiles, setProfiles] = useState<PermissionProfile[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PermissionProfile | null>(null);
  const [profileName, setProfileName] = useState('');
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (organization) {
      fetchProfiles();
    }
  }, [organization]);

  const fetchProfiles = async () => {
    if (!organization) return;

    const { data } = await supabase
      .from('permission_profiles')
      .select('*')
      .eq('organization_id', organization.id)
      .order('name');

    if (data) setProfiles(data);
  };

  const handleOpenDialog = (profile?: PermissionProfile) => {
    if (profile) {
      setEditingProfile(profile);
      setProfileName(profile.name);
      setPermissions(profile.permissions || DEFAULT_PERMISSIONS);
    } else {
      setEditingProfile(null);
      setProfileName('');
      setPermissions(DEFAULT_PERMISSIONS);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!organization || !profileName.trim()) return;

    try {
      const profileData = {
        organization_id: organization.id,
        name: profileName,
        permissions,
      };

      if (editingProfile) {
        const { error } = await supabase
          .from('permission_profiles')
          .update(profileData)
          .eq('id', editingProfile.id);

        if (error) throw error;
        toast({ title: t('settings.orgUpdated') });
      } else {
        const { error } = await supabase
          .from('permission_profiles')
          .insert([profileData]);

        if (error) throw error;
        toast({ title: t('common.success') });
      }

      setDialogOpen(false);
      fetchProfiles();
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({ title: t('common.error'), variant: 'destructive' });
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
      const { error } = await supabase
        .from('permission_profiles')
        .delete()
        .eq('id', deletingId);

      if (error) throw error;

      toast({ title: t('common.success') });
      fetchProfiles();
    } catch (error) {
      console.error('Error deleting profile:', error);
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setDeletingId(null);
    }
  };

  const permissionLabels = {
    can_view_contacts: 'Ver Contatos',
    can_edit_contacts: 'Editar Contatos',
    can_delete_contacts: 'Excluir Contatos',
    can_view_opportunities: 'Ver Oportunidades',
    can_edit_opportunities: 'Editar Oportunidades',
    can_delete_opportunities: 'Excluir Oportunidades',
    can_manage_settings: 'Gerenciar Configurações',
    can_manage_users: 'Gerenciar Usuários',
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Perfis de Permissão</CardTitle>
              <CardDescription>
                Configure os perfis de permissão da organização
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Perfil
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <h3 className="font-medium">{profile.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {Object.entries(profile.permissions || {})
                      .filter(([, value]) => value)
                      .length}{' '}
                    permissões ativas
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenDialog(profile)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteClick(profile.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProfile ? 'Editar Perfil' : 'Novo Perfil'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <Label htmlFor="profileName">Nome do Perfil</Label>
              <Input
                id="profileName"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <h3 className="font-medium">Permissões</h3>
              {Object.entries(permissionLabels).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <Label htmlFor={key}>{label}</Label>
                  <Switch
                    id={key}
                    checked={permissions[key as keyof typeof permissions]}
                    onCheckedChange={(checked) =>
                      setPermissions({ ...permissions, [key]: checked })
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave}>{t('common.save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir Perfil de Permissão"
        description="Tem certeza que deseja excluir este perfil? Usuários associados a este perfil perderão suas permissões."
        confirmText="Excluir"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleting}
      />
    </>
  );
}
