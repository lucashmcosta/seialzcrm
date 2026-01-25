import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Loader2, ExternalLink, Link2 } from 'lucide-react';
import type { KommoCredentials } from '@/hooks/useKommoMigration';

interface KommoCredentialsStepProps {
  onValidated: (credentials: { subdomain: string; access_token: string; account_name: string }) => void;
  validateMutation: any;
  savedCredentials?: KommoCredentials | null;
}

export function KommoCredentialsStep({ onValidated, validateMutation, savedCredentials }: KommoCredentialsStepProps) {
  const [useOtherCredentials, setUseOtherCredentials] = useState(false);
  const [subdomain, setSubdomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [validatedAccount, setValidatedAccount] = useState<string | null>(null);

  // Se tem credenciais salvas e não quer usar outras, mostrar resumo
  const usingSavedCredentials = savedCredentials && !useOtherCredentials;

  const handleValidate = async () => {
    const result = await validateMutation.mutateAsync({ subdomain, access_token: accessToken });
    
    if (result.valid) {
      setValidatedAccount(result.account_name);
      onValidated({
        subdomain,
        access_token: accessToken,
        account_name: result.account_name,
      });
    }
  };

  const handleUseSavedCredentials = () => {
    if (savedCredentials) {
      onValidated({
        subdomain: savedCredentials.subdomain,
        access_token: savedCredentials.access_token,
        account_name: savedCredentials.account_name || savedCredentials.subdomain,
      });
    }
  };

  const isValid = validatedAccount !== null;
  const hasError = validateMutation.isError || (validateMutation.data && !validateMutation.data.valid);
  const errorMessage = validateMutation.data?.error || validateMutation.error?.message;

  // Se está usando credenciais salvas, mostra UI simplificada
  if (usingSavedCredentials) {
    return (
      <div className="space-y-6">
        <Alert className="border-primary/50 bg-primary/5">
          <Link2 className="h-4 w-4 text-primary" />
          <AlertDescription className="text-foreground">
            <div className="space-y-1">
              <p className="font-medium">Usando credenciais da integração conectada</p>
              <p className="text-sm text-muted-foreground">
                Subdomínio: <strong>{savedCredentials.subdomain}.kommo.com</strong>
              </p>
              {savedCredentials.account_name && (
                <p className="text-sm text-muted-foreground">
                  Conta: <strong>{savedCredentials.account_name}</strong>
                </p>
              )}
            </div>
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-3">
          <Button onClick={handleUseSavedCredentials} className="w-full">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Continuar com estas credenciais
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setUseOtherCredentials(true)}
            className="text-muted-foreground"
          >
            Usar outras credenciais
          </Button>
        </div>
      </div>
    );
  }

  // UI padrão para inserir novas credenciais
  return (
    <div className="space-y-6">
      {savedCredentials && useOtherCredentials && (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setUseOtherCredentials(false)}
          className="text-muted-foreground -mt-2"
        >
          ← Usar credenciais da integração
        </Button>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="subdomain">Subdomínio Kommo</Label>
          <div className="flex items-center gap-2">
            <Input
              id="subdomain"
              placeholder="suaempresa"
              value={subdomain}
              onChange={(e) => {
                setSubdomain(e.target.value);
                setValidatedAccount(null);
              }}
              disabled={validateMutation.isPending}
            />
            <span className="text-muted-foreground text-sm whitespace-nowrap">.kommo.com</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Ex: se seu Kommo é suaempresa.kommo.com, digite apenas "suaempresa"
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="access_token">Access Token (Long-lived)</Label>
          <Input
            id="access_token"
            type="password"
            placeholder="Seu access token do Kommo"
            value={accessToken}
            onChange={(e) => {
              setAccessToken(e.target.value);
              setValidatedAccount(null);
            }}
            disabled={validateMutation.isPending}
          />
          <p className="text-xs text-muted-foreground">
            Gere em{' '}
            <a
              href="https://www.kommo.com/pt-br/developers/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Configurações → Integrações → Criar integração privada
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
      </div>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage || 'Erro ao validar credenciais'}</AlertDescription>
        </Alert>
      )}

      {isValid && (
        <Alert className="border-primary/50 bg-primary/5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertDescription className="text-foreground">
            Conectado com sucesso à conta: <strong>{validatedAccount}</strong>
          </AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleValidate}
        disabled={!subdomain || !accessToken || validateMutation.isPending}
        className="w-full"
        variant={isValid ? 'outline' : 'default'}
      >
        {validateMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Validando...
          </>
        ) : isValid ? (
          <>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Credenciais Válidas
          </>
        ) : (
          'Validar Conexão'
        )}
      </Button>
    </div>
  );
}
