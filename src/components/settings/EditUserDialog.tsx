import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { SpinnerGap, Upload } from '@phosphor-icons/react';

interface PermissionProfile {
  id: string;
  name: string;
}

export interface EditableUser {
  membership_id: string;
  user_id: string;
  full_name: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  permission_profile_id: string | null;
}

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: EditableUser | null;
  permissionProfiles: PermissionProfile[];
  onSaved: () => void;
}

export function EditUserDialog({ open, onOpenChange, user, permissionProfiles, onSaved }: EditUserDialogProps) {
  const { userProfile } = useOrganization();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);

  const isSelf = user?.user_id === userProfile?.id;

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setAvatarUrl(user.avatar_url || null);
      setProfileId(user.permission_profile_id || '');
      setIsActive(user.is_active);
    }
  }, [user]);

  if (!user) return null;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.user_id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      toast({ description: 'Foto carregada. Clique em Salvar para confirmar.' });
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', description: err.message || 'Erro no upload' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update user personal data
      const { error: userErr } = await supabase
        .from('users')
        .update({
          full_name: fullName,
          first_name: firstName || null,
          last_name: lastName || null,
          avatar_url: avatarUrl,
        })
        .eq('id', user.user_id);
      if (userErr) throw userErr;

      // Update membership (profile + status), but block self-demotion / self-deactivation
      const updates: Record<string, any> = {};
      if (!isSelf) {
        if (profileId !== (user.permission_profile_id || '')) {
          updates.permission_profile_id = profileId || null;
        }
        if (isActive !== user.is_active) {
          updates.is_active = isActive;
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error: memErr } = await supabase
          .from('user_organizations')
          .update(updates)
          .eq('id', user.membership_id);
        if (memErr) throw memErr;
      }

      toast({ description: 'Usuário atualizado com sucesso' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', description: err.message || 'Erro ao salvar' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth/sign-in`,
      });
      if (error) throw error;
      toast({ description: `Email de reset enviado para ${user.email}` });
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', description: err.message || 'Erro ao enviar reset' });
    } finally {
      setResetting(false);
    }
  };

  const initials = (fullName || user.email).split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>Atualize dados pessoais, perfil e status.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2 flex-1 overflow-y-auto -mx-1 px-1">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <Label htmlFor="avatar-upload" className="cursor-pointer">
                <div className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md hover:bg-muted">
                  {uploading ? <SpinnerGap className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? 'Enviando...' : 'Alterar foto'}
                </div>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                />
              </Label>
            </div>
          </div>

          {/* Personal data */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Dados pessoais</h4>
            <div className="space-y-2">
              <Label htmlFor="full-name">Nome completo *</Label>
              <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first-name">Primeiro nome</Label>
                <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-name">Sobrenome</Label>
                <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} readOnly className="bg-muted" />
              <p className="text-xs text-muted-foreground">Para alterar email use o fluxo próprio de autenticação.</p>
            </div>
          </div>

          <Separator />

          {/* Permission & status */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Permissão e status</h4>
            <div className="space-y-2">
              <Label htmlFor="profile">Perfil de permissão</Label>
              <Select value={profileId} onValueChange={setProfileId} disabled={isSelf}>
                <SelectTrigger id="profile">
                  <SelectValue placeholder="Sem perfil" />
                </SelectTrigger>
                <SelectContent>
                  {permissionProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSelf && <p className="text-xs text-muted-foreground">Você não pode alterar seu próprio perfil.</p>}
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="active" className="cursor-pointer">Usuário ativo</Label>
                <p className="text-xs text-muted-foreground">Inativos não conseguem acessar a organização.</p>
              </div>
              <Switch id="active" checked={isActive} onCheckedChange={setIsActive} disabled={isSelf} />
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !fullName.trim()}>
            {saving && <SpinnerGap className="w-4 h-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
