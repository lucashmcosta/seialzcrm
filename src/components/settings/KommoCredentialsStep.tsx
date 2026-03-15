import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle, SpinnerGap, ArrowSquareOut, LinkSimple, CaretDown, CaretRight, Info } from '@phosphor-icons/react';
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
  const [guideOpen, setGuideOpen] = useState(false);

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

  // Guia inline colapsável
  const InlineGuide = () => (
    <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground gap-2 px-0">
          <Info className="h-4 w-4 text-primary" />
          {guideOpen ? <CaretDown className="h-3 w-3" /> : <CaretRight className="h-3 w-3" />}
          Como obter o Access Token do Kommo
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-4 rounded-lg bg-muted/50 space-y-3 text-sm">
          <ol className="space-y-3 list-decimal list-inside text-muted-foreground">
            <li>
              Acesse{' '}
              <a
                href="https://www.kommo.com/pt-br/developers/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Kommo Developers <ArrowSquareOut className="h-3 w-3" />
              </a>
            </li>
            <li>
              No painel do Kommo, vá em <strong className="text-foreground">Configurações → Integrações</strong>
            </li>
            <li>
              Clique em <strong className="text-foreground">"Criar integração"</strong> e selecione <strong className="text-foreground">"Integração privada"</strong>
            </li>
            <li>
              Dê um nome (ex: "Migração Seialz") e clique em <strong className="text-foreground">"Salvar"</strong>
            </li>
            <li>
              Na aba <strong className="text-foreground">"Chaves e escopos"</strong>, copie o <strong className="text-foreground">Access Token (Long-lived)</strong>
            </li>
            <li>
              Certifique-se de que os escopos incluem: <strong className="text-foreground">Contatos, Leads, Empresas, Tarefas, Notas</strong>
            </li>
          </ol>
          <p className="text-xs text-muted-foreground/80 pt-1">
            💡 O subdomínio é a parte antes de ".kommo.com" na URL do seu Kommo.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );

  if (usingSavedCredentials) {
    return (
      <div className="space-y-6">
        <Alert className="border-primary/50 bg-primary/5">
          <LinkSimple className="h-4 w-4 text-primary" />
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
             <CheckCircle className="h-4 w-4 mr-2" />
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
        </div>
      </div>

      <InlineGuide />

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage || 'Erro ao validar credenciais'}</AlertDescription>
        </Alert>
      )}

      {isValid && (
        <Alert className="border-primary/50 bg-primary/5">
          <CheckCircle className="h-4 w-4 text-primary" />
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
            <SpinnerGap className="h-4 w-4 mr-2 animate-spin" />
            Validando...
          </>
        ) : isValid ? (
          <>
            <CheckCircle className="h-4 w-4 mr-2" />
            Credenciais Válidas
          </>
        ) : (
          'Validar Conexão'
        )}
      </Button>
    </div>
  );
}
