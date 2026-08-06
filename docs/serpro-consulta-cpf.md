# Documentação Técnica — API Consulta CPF (SERPRO)

> Fonte oficial: https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cpf/pt/
> Compilado a partir da documentação pública do SERPRO em 06/08/2026.
>
> **Uso no seialz:** provedor de **fallback** da consulta de CPF, atrás do `cpf-brasil`.
> Cadeia: `cpf-brasil` → **SERPRO v2** (só CPF) → **SERPRO v3** (CPF + data de nascimento,
> só escala em falha de provedor do v2). Implementação em
> `supabase/functions/_shared/registry/providers.ts` (`lookupSerproCpfV2` / `lookupSerproCpfV3`)
> e no dispatcher de `supabase/functions/registry-lookup/index.ts`.

## 1. Visão geral

A API Consulta CPF é um serviço HTTP REST síncrono que consulta as informações cadastrais
básicas de uma Pessoa Física na Receita Federal a partir do número de CPF (e, na v3, também
da data de nascimento). Não há processamento assíncrono: cada chamada retorna a resposta
diretamente no mesmo request/response HTTP.

**Não existe mecanismo de callback/webhook nesta API.** A integração é estritamente
request → response.

## 2. Autenticação (OAuth2 — Client Credentials)

O gateway SERPRO usa OAuth2 com fluxo *client credentials*.

1. **Credenciais**: `Consumer Key` e `Consumer Secret`, obtidos na Área do Cliente Serpro.
2. **Obtenção do token**: `POST https://gateway.apiserpro.serpro.gov.br/token`
   - Header `Authorization: Basic <base64(consumerKey:consumerSecret)>`
   - Header `Content-Type: application/x-www-form-urlencoded`
   - Body: `grant_type=client_credentials`
3. **Resposta**: JSON com `access_token`, `token_type` (Bearer), `expires_in` (validade de 1 hora) e `scope`.
4. **Uso do token**: enviar `Authorization: Bearer <access_token>` em cada chamada de consulta.
5. **Renovação**: quando o gateway retornar `401`, solicitar novo token. Recomenda-se renovar a cada hora.

> No seialz o token é cacheado em memória (nível de módulo) com buffer de 60s antes do vencimento
> e renovado uma vez automaticamente ao receber `401`. O mesmo token serve v2 e v3.

Erro comum: se a obtenção do token retornar `415 Unsupported Media Type`, confirme o header
`Content-Type: application/x-www-form-urlencoded`.

## 3. Endpoints disponíveis

| Versão | Método/Path | Base URL (produção) |
|---|---|---|
| v1 | `GET /cpf/{ni}` | `https://gateway.apiserpro.serpro.gov.br/consulta-cpf/v1` |
| v1 (DF) | `GET /cpf/{ni}` | `https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v1` |
| v2 (DF) | `GET /cpf/{ni}` | `https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v2` |
| v3 (DF) — atual | `GET /cpf/{ni}/{nasc}` | `https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v3` |

Todas as versões também expõem `GET /status` para verificar a saúde da API.
O gateway **diferencia maiúsculas/minúsculas** no path — chamar exatamente como documentado.

### 3.1 Parâmetros

| Nome | Local | Obrigatório | Descrição |
|---|---|---|---|
| `ni` | path | sim | Número de inscrição do contribuinte (CPF) |
| `nasc` | path | sim (só v3) | Data de nascimento no formato `ddmmaaaa` |
| `x-signature` | header | não | Enviar `1` para solicitar assinatura de carimbo de tempo |
| `x-request-tag` | header | não | Texto livre (até 32 caracteres) para agrupamento no faturamento |

## 4. Resposta de sucesso (schema)

```json
{
  "ni": "99999999999",
  "nome": "PESSOA FISICA DA SILVA",
  "situacao": {
    "codigo": "0",
    "descricao": "Regular"
  },
  "nascimento": "01051976",
  "dataInscricao": "10051976",
  "nomeSocial": "PESSOA FISICA DA SILVA SOCIAL"
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `ni` | string | CPF do contribuinte |
| `nome` | string | Nome do contribuinte |
| `situacao` | objeto `Situacao` (`codigo`, `descricao`) | Situação cadastral |
| `nascimento` | string `ddmmaaaa` | Data de nascimento |
| `dataInscricao` | string `ddmmaaaa` | Data de inscrição do CPF |
| `nomeSocial` | string | Nome social do contribuinte |

**Observações de integração (seialz):**
- **Não retorna `sexo`.** `nome da mãe` é incerto (mapeado se vier, senão `null`).
- `situacao` é preservada apenas em raw (`registration_status`), **não exibida na UI**.
- `nomeSocial` e `dataInscricao` **não são usados/persistidos** por ora (só usamos `nome`).
- `nascimento` da resposta é o valor autoritativo usado como `birth_date`.

## 5. Mapeamento para o payload interno

| Interno | Origem SERPRO |
|---|---|
| `cpf` | `ni` |
| `full_name` | `nome` |
| `registration_status` | `situacao.descricao` (raw; não vai para a UI) |
| `birth_date` | `nascimento` (`ddmmaaaa` → ISO); cai para a data de entrada se ausente |
| `sex` | `null` (não retornado) |
| `mother_name` | `nomeMae`/`nome_mae` se presente, senão `null` |

## 6. Erros (mapeamento para vocabulário interno)

| HTTP | Erro interno | Retryable |
|---|---|---|
| 400 / 422 | `invalid_or_not_found` | não |
| 401 / 403 | `provider_auth_error` | não |
| 404 | `not_found` | não |
| 429 | `provider_quota_exceeded` | não |
| ≥ 500 / 0 | `upstream_error` / `network_error` / `timeout` | sim |

## 7. Configuração no seialz (secrets da Edge Function)

| Secret | Obrigatório | Default |
|---|---|---|
| `SERPRO_CONSUMER_KEY` | sim | — |
| `SERPRO_CONSUMER_SECRET` | sim | — |
| `SERPRO_CPF_BASE_URL` | não | `https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df` (o código anexa `/v2/...` e `/v3/...`) |
| `SERPRO_TOKEN_URL` | não | `https://gateway.apiserpro.serpro.gov.br/token` |
| `SERPRO_REQUEST_TAG` | não | — (enviado como `x-request-tag`) |

O fallback SERPRO fica **ativo automaticamente** quando `SERPRO_CONSUMER_KEY` e
`SERPRO_CONSUMER_SECRET` estão configurados; se ausentes, a consulta se comporta como
antes (só `cpf-brasil`). Continua sob o gate de autorização de CPF por organização
(`registry_provider_settings`).

Definição dos secrets:

```bash
supabase secrets set SERPRO_CONSUMER_KEY=... SERPRO_CONSUMER_SECRET=...
```
