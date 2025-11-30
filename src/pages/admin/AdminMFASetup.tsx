import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Shield, Copy } from 'lucide-react';

export default function AdminMFASetup() {
  const [mfaCode, setMfaCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [adminUser, setAdminUser] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAdminUser();
  }, []);

  const checkAdminUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      navigate('/admin/login');
      return;
    }

    const { data: admin } = await supabase
      .from('admin_users')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .single();

    if (!admin) {
      navigate('/admin/login');
      return;
    }

    if (admin.mfa_enabled) {
      navigate('/admin');
      return;
    }

    setAdminUser(admin);
    generateMFASecret(admin.email);
    setLoading(false);
  };

  const generateMFASecret = (email: string) => {
    const randomSecret = Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map(b => b.toString(36))
      .join('')
      .toUpperCase();
    
    setSecret(randomSecret);
    
    const qrUrl = `otpauth://totp/CRM%20Admin:${email}?secret=${randomSecret}&issuer=CRM`;
    setQrCode(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`);
    
    const codes = Array.from({ length: 8 }, () => 
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );
    setBackupCodes(codes);
  };

  const handleVerifyMFA = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('admin_users')
        .update({
          mfa_enabled: true,
          mfa_secret: secret,
          mfa_backup_codes: backupCodes,
          mfa_setup_completed_at: new Date().toISOString(),
        })
        .eq('id', adminUser?.id);

      if (error) throw error;

      await supabase.from('admin_audit_logs').insert({
        admin_user_id: adminUser?.id,
        action: 'mfa_setup',
        ip_address: window.location.hostname,
      });

      toast({
        title: 'MFA configurado com sucesso!',
        description: 'Você será redirecionado para o painel admin.',
      });

      setTimeout(() => navigate('/admin'), 2000);
    } catch (error) {
      toast({
        title: 'Erro ao configurar MFA',
        description: 'Verifique o código e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: 'Texto copiado para a área de transferência.',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Configurar Autenticação 2FA</CardTitle>
            <CardDescription>
              A autenticação de dois fatores é obrigatória para todos os administradores
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">1. Escaneie o QR Code</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Use o Google Authenticator ou similar para escanear:
              </p>
              {qrCode && (
                <div className="flex justify-center">
                  <img src={qrCode} alt="QR Code" className="border rounded-lg p-4" />
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-2">2. Ou insira manualmente</h3>
              <div className="flex items-center gap-2">
                <Input value={secret} readOnly className="font-mono" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(secret)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">3. Códigos de Backup</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Guarde estes códigos em local seguro. Você pode usá-los se perder acesso ao autenticador:
              </p>
              <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg">
                {backupCodes.map((code, i) => (
                  <div key={i} className="font-mono text-sm">
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleVerifyMFA} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mfaCode">4. Digite o código do app</Label>
                <Input
                  id="mfaCode"
                  type="text"
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  maxLength={6}
                  required
                  disabled={submitting}
                  className="text-center text-2xl tracking-widest"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || mfaCode.length !== 6}
              >
                {submitting ? 'Verificando...' : 'Ativar 2FA'}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
