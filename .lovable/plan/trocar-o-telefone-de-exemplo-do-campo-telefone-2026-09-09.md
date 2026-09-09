# Trocar o telefone de exemplo do campo "Telefone"

O número que aparece em cinza no campo de telefone é só um texto de exemplo, não um dado salvo de ninguém. Ele foi escrito uma vez como modelo de formato e, por coincidência, é o seu número pessoal. Nada foi lido do seu contato nem do WhatsApp.

## O que muda

- Substituir o número de exemplo do Brasil por um número claramente fictício: `(11) 90000-0000`.
- Atualizar os mesmos exemplos que aparecem nos comentários explicativos do mesmo arquivo.

Nada mais muda: formatação, validação e envio continuam iguais.

## Detalhe técnico

Arquivo: `src/lib/phoneUtils.ts`
- Linha 14: `placeholder: '(11) 96429-8621'` → `'(11) 90000-0000'`.
- Linhas 164/174/175: exemplos em comentários passam a usar `90000-0000` / `5511900000000`.

Confirmado por busca: essas são as únicas ocorrências do número no código.
