import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, ArrowLeft } from 'lucide-react';

export default function ConfirmEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Verifique seu email</CardTitle>
          <CardDescription>
            Enviamos um link de confirmação para seu email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 text-center">
            {email && (
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{email}</strong>
              </p>
            )}
            
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Clique no link que enviamos para confirmar seu cadastro e ativar sua conta.
              </p>
              <p className="text-sm text-muted-foreground">
                Não recebeu o email? Verifique sua pasta de spam.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => navigate('/auth/signin')}
              className="w-full"
              variant="outline"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
