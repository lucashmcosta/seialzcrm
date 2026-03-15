import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserCircle, ArrowRight, Info } from '@phosphor-icons/react';

import type { KommoUserMapping } from '@/hooks/useKommoMigration';

interface KommoUserMappingStepProps {
  userMappings: KommoUserMapping[];
  crmUsers: { id: string; full_name: string; email: string }[];
  onMappingsChange: (mappings: KommoUserMapping[]) => void;
}

export function KommoUserMappingStep({
  userMappings,
  crmUsers = [],
  onMappingsChange,
}: KommoUserMappingStepProps) {
  const handleUserSelect = (kommoUserId: number, seialzUserId: string | null) => {
    onMappingsChange(
      userMappings.map((m) =>
        m.kommo_user_id === kommoUserId
          ? { ...m, seialz_user_id: seialzUserId === '__none__' ? null : seialzUserId }
          : m
      )
    );
  };

  const mappedCount = userMappings.filter((m) => m.seialz_user_id).length;

  if (userMappings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <UserCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground text-center">
          Nenhum usuário encontrado no Kommo. O mapeamento de responsáveis será ignorado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-foreground">
          Associe os usuários do Kommo aos usuários do CRM para manter os responsáveis corretos em contatos e oportunidades.
          <span className="block text-xs text-muted-foreground mt-1">
            Usuários não mapeados serão atribuídos ao usuário que iniciou a migração.
          </span>
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {mappedCount} de {userMappings.length} mapeados
        </span>
        <Badge variant="secondary">
          {userMappings.length} usuários no Kommo
        </Badge>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário Kommo</TableHead>
              <TableHead className="w-8"></TableHead>
              <TableHead>Usuário CRM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {userMappings.map((mapping) => (
              <TableRow key={mapping.kommo_user_id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <UserCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {mapping.kommo_user_name}
                      </p>
                      {mapping.kommo_user_email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {mapping.kommo_user_email}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </TableCell>
                <TableCell>
                  <Select
                    value={mapping.seialz_user_id || '__none__'}
                    onValueChange={(value) =>
                      handleUserSelect(mapping.kommo_user_id, value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecionar usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground">— Não mapear —</span>
                      </SelectItem>
                      {crmUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          <div className="flex flex-col">
                            <span>{user.full_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
