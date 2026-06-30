## Fix: modal "Adicionar número desta WABA" cortando conteúdo

Apenas ajuste de UI no `AddMetaWhatsAppNumberDialog.tsx`:

- Trocar `<DialogContent>` por `<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">` para alargar o modal e permitir scroll vertical em telas menores.

Sem mudanças de lógica, backend, ou outros arquivos.