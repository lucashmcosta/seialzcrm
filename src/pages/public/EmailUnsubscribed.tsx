// Página pública depois do link de descadastro de um e-mail de marketing (enviado por qualquer org).
import { useSearchParams } from 'react-router-dom';

const TEXT: Record<string, { title: string; body: string }> = {
  ok: { title: 'Pronto', body: 'Você não vai mais receber e-mails de conteúdo e ofertas deste remetente. Mensagens sobre o seu atendimento continuam chegando.' },
  invalid: { title: 'Link inválido', body: 'Este link de descadastro não é válido ou já expirou.' },
  error: { title: 'Não foi possível concluir', body: 'Tente abrir o link de novo em alguns minutos.' },
};

export default function EmailUnsubscribed() {
  const [params] = useSearchParams();
  const t = TEXT[params.get('status') ?? ''] ?? TEXT.invalid;
  return (
    <div className="flex min-h-screen items-start justify-center bg-muted/40 px-4 py-16">
      <div className="w-full max-w-md rounded-lg border bg-background p-7">
        <h1 className="mb-3 text-xl font-semibold">{t.title}</h1>
        <p className="leading-relaxed text-muted-foreground">{t.body}</p>
      </div>
    </div>
  );
}
