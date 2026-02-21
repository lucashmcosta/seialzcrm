import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface OrgUser {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface OwnerSelectorProps {
  value: string | null;
  onChange: (userId: string | null) => void;
  size?: 'sm' | 'default';
  placeholder?: string;
}

export function OwnerSelector({ value, onChange, size = 'default', placeholder = 'Sem responsável' }: OwnerSelectorProps) {
  const { organization } = useOrganizationContext();
  const [users, setUsers] = useState<OrgUser[]>([]);

  useEffect(() => {
    if (!organization?.id) return;

    const fetchUsers = async () => {
      const { data } = await supabase
        .from('user_organizations')
        .select('user_id, users(id, full_name, avatar_url)')
        .eq('organization_id', organization.id)
        .eq('is_active', true);

      if (data) {
        const mapped = data
          .map((row: any) => row.users)
          .filter(Boolean) as OrgUser[];
        setUsers(mapped);
      }
    };

    fetchUsers();
  }, [organization?.id]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <Select
      value={value || 'none'}
      onValueChange={(v) => onChange(v === 'none' ? null : v)}
    >
      <SelectTrigger className={size === 'sm' ? 'h-8 text-sm' : ''}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{placeholder}</SelectItem>
        {users.map((user) => (
          <SelectItem key={user.id} value={user.id}>
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                <AvatarFallback className="text-[10px]">{getInitials(user.full_name)}</AvatarFallback>
              </Avatar>
              <span>{user.full_name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
