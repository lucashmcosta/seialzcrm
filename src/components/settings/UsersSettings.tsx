import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, ChevronDown, Mail, UserRoundPlus, Clock, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface UserMembership {
  id: string;
  user_id: string;
  is_active: boolean;
  permission_profile_id: string | null;
  users: {
    full_name: string;
    email: string;
  };
  permission_profiles?: {
    name: string;
  } | null;
}

interface PermissionProfile {
  id: string;
  name: string;
}

interface Invitation {
  id: string;
  email: string;
  status: string;
  created_at: string;
  permission_profiles?: {
    name: string;
  } | null;
}

export function UsersSettings() {
  const { organization, userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [permissionProfiles, setPermissionProfiles] = useState<PermissionProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Invite dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteProfileId, setInviteProfileId] = useState<string>('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  
  // Create user dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    password: '',
  });
  const [createProfileId, setCreateProfileId] = useState<string>('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  useEffect(() => {
    if (organization?.id) {
      fetchMemberships();
      fetchPermissionProfiles();
      fetchInvitations();
    }
  }, [organization?.id]);

  const fetchMemberships = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('user_organizations')
        .select('id, user_id, is_active, permission_profile_id, users(full_name, email), permission_profiles(name)')
        .eq('organization_id', organization.id);

      if (error) throw error;
      setMemberships(data || []);
    } catch (error) {
      console.error('Error fetching memberships:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissionProfiles = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('permission_profiles')
        .select('id, name')
        .eq('organization_id', organization.id)
        .order('name');

      if (error) throw error;
      setPermissionProfiles(data || []);
      
      // Set default to Sales Rep or first profile
      if (data && data.length > 0) {
        const salesRep = data.find(p => p.name === 'Sales Rep');
        const defaultId = salesRep?.id || data[0].id;
        setInviteProfileId(defaultId);
        setCreateProfileId(defaultId);
      }
    } catch (error) {
      console.error('Error fetching permission profiles:', error);
    }
  };

  const fetchInvitations = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('id, email, status, created_at, permission_profiles(name)')
        .eq('organization_id', organization.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvitations(data || []);
    } catch (error) {
      console.error('Error fetching invitations:', error);
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      toast({
        description: 'Convite cancelado',
      });
      fetchInvitations();
    } catch (error) {
      console.error('Error canceling invitation:', error);
      toast({
        variant: 'destructive',
        description: t('common.error'),
      });
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !userProfile?.id) return;

    setInviteSubmitting(true);
    try {
      const { error } = await supabase
        .from('invitations')
        .insert({
          organization_id: organization.id,
          email: inviteEmail,
          permission_profile_id: inviteProfileId || null,
          invited_by_user_id: userProfile.id,
          token: crypto.randomUUID(),
          status: 'pending',
        });

      if (error) throw error;

      toast({
        description: t('settings.userInvited'),
      });
      setInviteDialogOpen(false);
      setInviteEmail('');
      fetchInvitations();
    } catch (error) {
      console.error('Error inviting user:', error);
      toast({
        variant: 'destructive',
        description: t('common.error'),
      });
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    if (createForm.password.length < 6) {
      toast({
        variant: 'destructive',
        description: 'A senha deve ter pelo menos 6 caracteres',
      });
      return;
    }

    setCreateSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('create-user', {
        body: {
          email: createForm.email,
          full_name: createForm.full_name,
          password: createForm.password,
          permission_profile_id: createProfileId,
          organization_id: organization.id,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao criar usuário');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        description: 'Usuário criado com sucesso!',
      });
      setCreateDialogOpen(false);
      setCreateForm({ full_name: '', email: '', password: '' });
      fetchMemberships();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        variant: 'destructive',
        description: error.message || t('common.error'),
      });
    } finally {
      setCreateSubmitting(false);
    }
  };

  const toggleStatus = async (membershipId: string, currentStatus: boolean) => {
    if (!organization?.id) return;

    try {
      // If activating, check seat limit
      if (!currentStatus) {
        // Get subscription details
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('id, max_seats')
          .eq('organization_id', organization.id)
          .single();

        // Get current seat count
        const { data: usage } = await supabase
          .from('subscription_usage')
          .select('current_seat_count')
          .eq('subscription_id', subscription?.id || '')
          .single();

        const currentSeats = usage?.current_seat_count || 0;
        const maxSeats = subscription?.max_seats || 0;

        if (currentSeats >= maxSeats) {
          toast({
            variant: 'destructive',
            title: t('settings.seatLimitReached'),
            description: t('settings.seatLimitDescription'),
          });
          return;
        }
      }

      const { data, error } = await supabase
        .from('user_organizations')
        .update({ is_active: !currentStatus })
        .eq('id', membershipId)
        .select('id, is_active')
        .single();

      if (error) throw error;

      if (!data) {
        throw new Error('Sem permissão para atualizar este usuário');
      }

      // Update seat count
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('organization_id', organization.id)
        .single();

      if (subscription) {
        const activeCount = memberships.filter(m => 
          m.id === membershipId ? !currentStatus : m.is_active
        ).length;

        await supabase
          .from('subscription_usage')
          .update({ 
            current_seat_count: activeCount,
            last_calculated_at: new Date().toISOString()
          })
          .eq('subscription_id', subscription.id);
      }

      toast({
        description: !currentStatus ? t('settings.userActivated') : t('settings.userDeactivated'),
      });
      fetchMemberships();
    } catch (error) {
      console.error('Error toggling user status:', error);
      toast({
        variant: 'destructive',
        description: t('common.error'),
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('settings.users')}</CardTitle>
            <CardDescription>Gerencie usuários e suas permissões</CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                Adicionar Usuário
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setInviteDialogOpen(true)}>
                <Mail className="w-4 h-4 mr-2" />
                Convidar por email
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
                <UserRoundPlus className="w-4 h-4 mr-2" />
                Criar conta diretamente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Convites Pendentes ({invitations.length})
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Data do Convite</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">{invitation.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {invitation.permission_profiles?.name || 'Sem perfil'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(invitation.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelInvitation(invitation.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancelar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Active Users */}
        <div>
          {invitations.length > 0 && (
            <h4 className="text-sm font-medium mb-3">
              Usuários Ativos ({memberships.filter(m => m.users).length})
            </h4>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>{t('settings.status')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.filter(m => m.users).map((membership) => (
                <TableRow key={membership.id}>
                  <TableCell className="font-medium">{membership.users?.full_name}</TableCell>
                  <TableCell>{membership.users?.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {membership.permission_profiles?.name || 'Sem perfil'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={membership.is_active ? 'default' : 'secondary'}>
                      {membership.is_active ? t('settings.active') : t('settings.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleStatus(membership.id, membership.is_active)}
                    >
                      {membership.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <form onSubmit={handleInvite}>
            <DialogHeader>
              <DialogTitle>Convidar Usuário</DialogTitle>
              <DialogDescription>
                Envie um convite por email para entrar na sua organização
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">{t('settings.email')}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-profile">{t('settings.role')}</Label>
                <Select value={inviteProfileId} onValueChange={setInviteProfileId}>
                  <SelectTrigger id="invite-profile">
                    <SelectValue placeholder="Selecione um perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {permissionProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  O usuário receberá um email com link para criar sua conta
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={inviteSubmitting}>
                {inviteSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar Convite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreateUser}>
            <DialogHeader>
              <DialogTitle>Criar Usuário</DialogTitle>
              <DialogDescription>
                Crie uma conta com acesso imediato ao sistema
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">Nome completo *</Label>
                <Input
                  id="create-name"
                  type="text"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, full_name: e.target.value }))}
                  placeholder="João Silva"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email *</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="joao@empresa.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-password">Senha temporária *</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo 6 caracteres. O usuário poderá alterar depois.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-profile">Perfil de permissão</Label>
                <Select value={createProfileId} onValueChange={setCreateProfileId}>
                  <SelectTrigger id="create-profile">
                    <SelectValue placeholder="Selecione um perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {permissionProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createSubmitting}>
                {createSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Usuário
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
