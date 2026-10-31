# 3.1 OAuth 2.0 e OpenID Connect na prática

Você já fez login com Google num site qualquer. O site nunca viu sua senha do Google, e mesmo assim sabe seu nome e e-mail. Esta lição explica como, com os nomes certos, porque são esses nomes que aparecem nos logs, na documentação do Keycloak e nas perguntas de entrevista.

## O problema que o OAuth resolve

Antes do OAuth, para um aplicativo ler sua agenda do Google, você dava **a sua senha** ao aplicativo. Ele podia fazer tudo o que você faz, para sempre, e a única forma de revogar era trocar a senha (e quebrar todos os outros aplicativos).

::: conceito OAuth 2.0
Um protocolo de **autorização delegada** (RFC 6749): o dono de um recurso autoriza um aplicativo a acessar **parte** desse recurso, por **tempo limitado**, sem entregar a senha. O aplicativo recebe um **access token**, uma credencial com escopo e validade, que apresenta à API.
:::

::: analogia A chave de manobrista
Alguns carros vêm com uma chave de manobrista: ela liga o carro e dirige, mas não abre o porta-malas nem o porta-luvas. Você não entrega a sua chave ao manobrista; entrega uma com menos poder, que pode ser invalidada. O access token é a chave de manobrista. O servidor de autorização é quem corta as chaves.
:::

## Os quatro papéis

| Papel (nome da RFC) | No CreditFlow | O que faz |
|---|---|---|
| **Resource owner** | A Ana, cliente | Dona dos dados (as propostas dela) |
| **Client** | `creditflow-web` (a SPA) ou `creditflow-backoffice` (um job) | Quer acessar a API em nome de alguém, ou em nome próprio |
| **Authorization server** | Keycloak, realm `creditflow` | Autentica a Ana, pergunta o consentimento, emite tokens |
| **Resource server** | A API do CreditFlow (`creditflow-api`) | Recebe o token, confere, e decide se atende |

::: armadilha "Client" não é "o usuário"
Em OAuth, **client é o aplicativo**, não a pessoa. É a confusão número um de quem começa. Quando o log do Keycloak diz `client_id=creditflow-web`, está falando da SPA; o usuário aparece em `username` ou `userId`.
:::

## E o OpenID Connect?

OAuth 2.0 responde "este aplicativo **pode** acessar isto?". Ele **não** diz quem é o usuário. Por anos, cada empresa inventou seu jeito de descobrir quem logou (chamar `/me`, ler um campo proprietário), e vários desses jeitos tinham falhas de segurança.

::: conceito OpenID Connect (OIDC)
Uma camada de **identidade** em cima do OAuth 2.0. Acrescenta três coisas:

1. O escopo `openid`, que transforma o pedido de autorização num login.
2. O **ID token**, um JWT que diz **quem** autenticou, **quando** e **para qual client** (o `aud` do ID token é o client, não a API).
3. Padrões de descoberta (`/.well-known/openid-configuration`), de chaves (JWKS) e o endpoint `userinfo`.
:::

## Três tokens, três destinatários

| Token | Para quem | Formato no Keycloak | Para quê |
|---|---|---|---|
| **Access token** | A **API** (resource server) | JWT assinado | Provar que o portador pode chamar a API. A API confere `iss`, `aud`, assinatura, validade |
| **ID token** | O **client** (a SPA) | JWT assinado | O client saber quem logou (nome, e-mail). **Nunca** mande para a API |
| **Refresh token** | O **Keycloak** de novo | JWT opaco para você (só o Keycloak valida) | Pegar um access token novo sem pedir login de novo |

::: porque Por que a API não aceita ID token
O ID token tem `aud = creditflow-web`: foi feito para a SPA. Se a API aceitasse, qualquer ID token emitido para **qualquer** client do realm serviria para chamá-la, inclusive o de um client de terceiros que você integrou. O `aud` existe exatamente para cada token valer só onde foi pensado. Na lição 3.5 a API confere `aud = creditflow-api`, e um ID token é recusado.
:::

## Os fluxos (*grant types*) que importam

| Fluxo | Quem usa | No CreditFlow |
|---|---|---|
| **Authorization Code + PKCE** | Qualquer app com usuário: SPA, mobile, web com servidor | `creditflow-web` (lição 3.3) |
| **Client credentials** | Máquina falando com máquina, sem usuário | `creditflow-backoffice` (lição 3.5) |
| **Refresh token** | Renovar o access token | `creditflow-web` |
| ~~Implicit~~ | Era o fluxo das SPAs; o token voltava na URL | **Desligado**. O OAuth 2.1 o remove |
| ~~Password (ROPC)~~ | O app recebe usuário e senha e troca por token | Só no client `creditflow-testes`, só local, para testes automatizados |

::: porque Por que o *implicit* morreu
No implicit, o access token voltava no fragmento da URL (`#access_token=...`). URL vai para histórico do navegador, para extensões, para o cabeçalho `Referer` em alguns casos, e não há como provar que quem recebeu é quem pediu. O Authorization Code devolve só um **código** de uso único e curta duração, e o token é buscado por um POST direto ao Keycloak. Com PKCE (lição 3.3), mesmo um client público, sem segredo, consegue provar que é quem iniciou o fluxo. Por isso o *OAuth 2.0 Security Best Current Practice* (RFC 9700) recomenda código + PKCE para todo mundo.
:::

## A descoberta: o documento que configura tudo

Com o `docker compose up`, abra:

```bash
curl -s localhost:8081/realms/creditflow/.well-known/openid-configuration | jq '{issuer, authorization_endpoint, token_endpoint, jwks_uri, grant_types_supported, code_challenge_methods_supported}'
```

Você verá algo assim:

```json
{
  "issuer": "http://localhost:8081/realms/creditflow",
  "authorization_endpoint": "http://localhost:8081/realms/creditflow/protocol/openid-connect/auth",
  "token_endpoint": "http://localhost:8081/realms/creditflow/protocol/openid-connect/token",
  "jwks_uri": "http://localhost:8081/realms/creditflow/protocol/openid-connect/certs",
  "grant_types_supported": ["authorization_code", "implicit", "refresh_token", "password", "client_credentials", "..."],
  "code_challenge_methods_supported": ["plain", "S256"]
}
```

::: conceito Discovery
É esse documento que o JwtBearer da API baixa quando você configura `Authority`. Dele, a API tira o `issuer` (para conferir o `iss` dos tokens) e o `jwks_uri` (para baixar as chaves públicas e conferir assinaturas). Por isso a configuração da API tem **uma** URL e não cinco.
:::

::: armadilha `grant_types_supported` lista o que o realm suporta, não o que cada client pode
O realm suporta `implicit` e `password`, mas o client `creditflow-web` tem os dois desligados. Quem decide o que um client pode é a configuração do client (lição 3.2). Se alguém disser "o Keycloak está com implicit ligado" olhando só a descoberta, está olhando o lugar errado.
:::

## Por que Keycloak

O CreditFlow precisa de um servidor de identidade que rode **igual** no notebook e no AKS, que seja configurável como código e que fale OIDC padrão, para a API não depender dele. As opções reais:

| Opção | A favor | Contra |
|---|---|---|
| **Keycloak** | Open source (CNCF), roda local em contêiner, realm exportável em JSON, maduro, multi-realm | Você opera: banco, atualização, alta disponibilidade, tema |
| Microsoft Entra ID / External ID | Gerenciado, integrado à Azure | Não roda local; o curso ficaria preso à nuvem desde o módulo 3 |
| Auth0, Okta | Gerenciado, ótima experiência | Custo por usuário ativo; também não roda local |
| Duende IdentityServer | .NET puro, flexível | Licença comercial para empresas acima de um faturamento; você escreve mais código |

A decisão e o custo estão no [ADR 0003](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0003-keycloak.md). O ponto que vale a entrevista: **a API só fala OIDC/JWT padrão**. Trocar de provedor muda `Auth:Authority`, `Auth:Audience` e o lugar de onde vêm as roles; o resto do código não sabe que existe Keycloak.

::: video OAuth 2 Explained In Simple Terms (ByteByteGo, em inglês)
https://www.youtube.com/watch?v=ZV5yTm4pT8g
Quatro minutos com os papéis e o fluxo de autorização em diagrama. Bom para fixar o vocabulário desta lição.
:::

## Perguntas para responder sem olhar

::: pergunta
Qual a diferença entre OAuth 2.0 e OpenID Connect?
???
OAuth 2.0 é autorização delegada: dá a um aplicativo um access token para acessar um recurso, sem entregar a senha. Não diz quem é o usuário. OIDC é uma camada de identidade sobre o OAuth: acrescenta o escopo `openid`, o ID token (quem autenticou, quando, para qual client) e padrões de descoberta e chaves.
:::

::: pergunta
Por que a API não deve aceitar um ID token?
???
Porque o ID token é destinado ao client (`aud` = id do client), não à API. Aceitá-lo faria qualquer token emitido para qualquer client do realm valer na API. A API exige access token com `aud` igual a ela própria.
:::

::: pergunta
O que a API baixa quando você configura só o `Authority`?
???
O documento de descoberta (`/.well-known/openid-configuration`). Dele vêm o `issuer` esperado e o `jwks_uri`, de onde ela baixa as chaves públicas para conferir as assinaturas.
:::

**Próxima:** [3.2 O realm como código](02-realm-como-codigo.md).
