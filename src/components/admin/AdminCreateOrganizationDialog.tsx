import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SpinnerGap, ArrowsClockwise, CheckCircle, Copy } from '@phosphor-icons/react';
import { toast } from '@/hooks/use-toast';

interface Plan {
  name: string;
  display_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function AdminCreateOrganizationDialog({ open, onOpenChange, onCreated }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ name: string; email: string; password: string; created: boolean } | null>(null);

  const [form, setForm] = useState({
    organizationName: '',
    fullName: '',
    email: '',
    password: '',
    operatingCountryCode: 'BR',
    planName: 'free',
  });

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setForm({
      organizationName: '',
      fullName: '',
      email: '',
      password: generatePassword(),
      operatingCountryCode: 'BR',
      planName: 'free',
    });
    supabase
      .from('plans')
      .select('name, display_name')
      .eq('is_active', true)
      .order('price_per_seat_monthly', { ascending: true })
      .then(({ data }) => setPlans(data ?? []));
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-organization', {
        body: form,
      });
      const errMsg = (error as any)?.message || (data as any)?.error;
      if (errMsg || !data?.success) {
        toast({
          title: 'Não foi possível criar a conta',
          description: (data as any)?.error || errMsg || 'Erro inesperado.',
          variant: 'destructive',
        });
        return;
      }
      setResult({
        name: data.organization.name,
        email: data.user.email,
        password: form.password,
        created: data.user.created,
      });
      onCreated();
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message || 'Falha ao criar a conta.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyAccess = () => {
    if (!result) return;
    const text = result.created
      ? `Conta: ${result.name}\nE-mail: ${result.email}\nSenha: ${result.password}`
      : `Conta: ${result.name}\nE-mail: ${result.email}`;
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado', description: 'Dados de acesso copiados.' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                Conta criada
              </DialogTitle>
              <DialogDescription>
                {result.created
                  ? 'Repasse os dados abaixo e peça para trocar a senha no primeiro acesso.'
                  : 'Esse e-mail já existia no sistema e foi vinculado como administrador da nova conta (a senha dele não foi alterada).'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-md border bg-muted/40 p-4 text-sm">
              <div><span className="text-muted-foreground">Conta:</span> {result.name}</div>
              <div><span className="text-muted-foreground">E-mail:</span> {result.email}</div>
              {result.created && (
                <div><span className="text-muted-foreground">Senha:</span> <span className="font-mono">{result.password}</span></div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={copyAccess}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar
              </Button>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Nova conta</DialogTitle>
              <DialogDescription>
                Cria a conta e o primeiro usuário administrador dela.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Nome da conta</Label>
                <Input
                  id="org-name"
                  value={form.organizationName}
                  onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="admin-name">Nome do administrador</Label>
                  <Input
                    id="admin-name"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">E-mail</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-password">Senha inicial</Label>
                <div className="flex gap-2">
                  <Input
                    id="admin-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    minLength={8}
                    required
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setForm({ ...form, password: generatePassword() })}
                    title="Gerar senha forte"
                  >
                    <ArrowsClockwise className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>País de operação</Label>
                  <Select
                    value={form.operatingCountryCode}
                    onValueChange={(v) => setForm({ ...form, operatingCountryCode: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BR">Brasil</SelectItem>
                      <SelectItem value="PT">Portugal</SelectItem>
                      <SelectItem value="US">Estados Unidos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Plano inicial</Label>
                  <Select
                    value={form.planName}
                    onValueChange={(v) => setForm({ ...form, planName: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.name} value={p.name}>{p.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />}
                Criar conta
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
