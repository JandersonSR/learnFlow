# 3.2 O realm como código: clients, roles, scopes e tempos

Abra o [`creditflow-realm.json`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/local/keycloak/creditflow-realm.json). São umas 300 linhas, e cada bloco responde a uma pergunta de segurança. Esta lição lê o arquivo de cima a baixo.

## Realm

::: conceito Realm
Um espaço isolado dentro do Keycloak: usuários, clients, roles, chaves de assinatura e configurações próprias. O realm `master` é para administrar o Keycloak; **nunca** coloque aplicação nele. O CreditFlow tem o realm `creditflow`, e o `iss` de todo token dele é `http://<host>/realms/creditflow`.
:::

::: porque Por que realm como código, e não clicar no console
Configuração clicada não tem revisão, não tem histórico e não se repete igual em outro ambiente. Com o JSON no repositório, o Keycloak do notebook, o do CI (Testcontainers, módulo 4) e o do cluster sobem idênticos, e uma mudança de tempo de token passa por pull request como qualquer código.
:::

O Keycloak lê o arquivo na subida com `start-dev --import-realm`, de `/opt/keycloak/data/import/`. O `docker-compose.yml` monta a pasta `deploy/local/keycloak` ali.

::: armadilha O import não sobrescreve
Se o realm **já existe** no banco do Keycloak, o `--import-realm` o **ignora**. Você muda o JSON, reinicia, e nada muda. No compose local o Keycloak usa o banco embutido, sem volume, então `docker compose up -d --force-recreate keycloak` começa do zero. Num Keycloak com banco persistente, o caminho é outro: o admin REST API, o [keycloak-config-cli](https://github.com/adorsys/keycloak-config-cli) ou o operador do Keycloak com o recurso `KeycloakRealmImport` (que também só cria, não atualiza).
:::

## Roles de realm

```json
"roles": { "realm": [
  { "name": "cliente" }, { "name": "analista" },
  { "name": "operador-financeiro" }, { "name": "admin" }
]}
```

::: conceito Role de realm × role de client
Role de **realm** vale para o realm inteiro e aparece no token em `realm_access.roles`. Role de **client** pertence a um client e aparece em `resource_access.<client>.roles`. O CreditFlow usa roles de realm porque elas descrevem **o papel da pessoa no negócio** (analista é analista em qualquer tela), não uma permissão de um aplicativo.
:::

::: porque `admin` aqui não é admin do Keycloak
A role `admin` do realm `creditflow` é um papel de negócio (pode tudo **na plataforma de crédito**). Ela não dá acesso ao console do Keycloak, que pertence ao realm `master`. Misturar os dois é o caminho para um analista conseguir apagar o realm.
:::

## Os quatro clients

### `creditflow-api`: a audiência

```json
{ "clientId": "creditflow-api", "bearerOnly": true,
  "standardFlowEnabled": false, "directAccessGrantsEnabled": false, "serviceAccountsEnabled": false }
```

Este client **não loga ninguém**. Existe para ter um nome: `creditflow-api` é o valor que vai no `aud` dos tokens e que a API exige. Todos os fluxos desligados.

### `creditflow-web`: a SPA

```json
{ "clientId": "creditflow-web", "publicClient": true,
  "standardFlowEnabled": true, "implicitFlowEnabled": false, "directAccessGrantsEnabled": false,
  "redirectUris": ["http://localhost:5173/*", "http://localhost:8080/scalar/*"],
  "webOrigins": ["+"],
  "attributes": { "pkce.code.challenge.method": "S256", "post.logout.redirect.uris": "http://localhost:5173/*" } }
```

| Campo | Por quê |
|---|---|
| `publicClient: true` | Código no navegador não guarda segredo: qualquer pessoa abre o DevTools. Client público, sem `client_secret` |
| só `standardFlowEnabled` | Só Authorization Code. Implicit e password desligados |
| `pkce.code.challenge.method: S256` | O Keycloak **recusa** pedidos sem PKCE ou com `plain` para este client |
| `redirectUris` específicos | O Keycloak só devolve o código para estes endereços. `*` sozinho permitiria mandar o código para o site de um atacante |
| `webOrigins: ["+"]` | CORS: "as mesmas origens dos `redirectUris`". Sem isso, o POST da SPA ao `token_endpoint` é barrado pelo navegador |

::: armadilha Redirect URI curinga
`http://localhost:5173/*` é aceitável em desenvolvimento. Em produção, liste as URIs **exatas** (`https://app.creditflow.com.br/callback`). Um curinga largo, como `https://*.creditflow.com.br/*`, transforma qualquer subdomínio comprometido (um site de marketing esquecido) num ladrão de códigos.
:::

### `creditflow-backoffice`: máquina a máquina

```json
{ "clientId": "creditflow-backoffice", "publicClient": false, "secret": "backoffice-segredo-so-para-dev-local",
  "standardFlowEnabled": false, "serviceAccountsEnabled": true }
```

`serviceAccountsEnabled` liga o fluxo **client credentials**: o client troca `client_id` + `client_secret` por um token em nome **próprio**. O Keycloak cria um usuário técnico, a *conta de serviço*, chamado `service-account-creditflow-backoffice`, e é nele que se dão roles:

```json
{ "username": "service-account-creditflow-backoffice", "serviceAccountClientId": "creditflow-backoffice",
  "realmRoles": ["operador-financeiro"] }
```

::: armadilha Segredo no repositório
O segredo está no JSON porque este realm é **só de desenvolvimento**, e o nome dele grita isso. Em qualquer ambiente compartilhado, o segredo vem do Key Vault (módulo 9), é rotacionado, e o realm de produção não está no repositório com segredos. Melhor ainda: autenticação do client por JWT assinado (`private_key_jwt`) ou mTLS, em que não existe segredo compartilhado.
:::

### `creditflow-testes`: só local

Um client confidencial com `directAccessGrantsEnabled: true` (password grant). Serve para o `curl` dos labs e para os testes de integração obterem token de usuário sem navegador. **Nunca** vai para outro ambiente. Ele existe para você não ser tentado a ligar o password grant no `creditflow-web`.

## O mapper de audiência

Por padrão, o Keycloak põe no `aud` do access token os clients cujas **roles de client** aparecem no token (por isso você verá `"aud": "account"`, do client de conta que todo realm tem). Ele **não** sabe que a SPA vai chamar a `creditflow-api`. Quem diz isso é um *protocol mapper*:

```json
"protocolMappers": [{
  "name": "audience-creditflow-api",
  "protocolMapper": "oidc-audience-mapper",
  "config": { "included.client.audience": "creditflow-api", "access.token.claim": "true", "id.token.claim": "false" }
}]
```

::: conceito Protocol mapper
Uma regra que acrescenta ou transforma claims nos tokens. O `oidc-audience-mapper` acrescenta um valor ao `aud`. Está em `creditflow-web`, `creditflow-backoffice` e `creditflow-testes`: todo client que chama a API precisa dele. Esquecer o mapper é o 401 mais comum da vida com Keycloak (lição 3.6).
:::

::: dica Mapper no client ou num client scope
O mapper poderia morar num *client scope* (`creditflow-api-audience`) atribuído aos três clients. Fica mais elegante com muitos clients. O realm do CreditFlow põe direto nos clients por um motivo prático: se o JSON de import tiver a chave `clientScopes`, ela **substitui** os escopos padrão do Keycloak (`basic`, `roles`, `profile`, `email`...), e aí o `sub` e o `realm_access` somem do token. Para declarar um escopo próprio, você teria que declarar todos os padrões junto.
:::

## Scopes padrão: de onde vêm `sub` e `realm_access`

Como o JSON não declara `clientScopes`, o Keycloak cria os padrões e os atribui a cada client:

| Client scope | Põe no access token |
|---|---|
| `basic` | `sub` e `auth_time` (desde o Keycloak 25; antes, o `sub` vinha sempre) |
| `roles` | `realm_access.roles` e `resource_access` |
| `profile` | `preferred_username`, `name`, `given_name`... |
| `email` | `email`, `email_verified` |
| `web-origins` | `allowed-origins` (usado pelo CORS) |
| `acr` | `acr` (nível de autenticação) |

## Tempos de token: a parte que ninguém revisa

```json
"accessTokenLifespan": 300,
"accessCodeLifespan": 60,
"ssoSessionIdleTimeout": 1800,
"ssoSessionMaxLifespan": 36000,
"revokeRefreshToken": true,
"refreshTokenMaxReuse": 0
```

| Configuração | Valor | O que decide |
|---|---|---|
| `accessTokenLifespan` | 5 min | Quanto tempo um token roubado funciona, e quanto tempo uma role retirada continua valendo |
| `accessCodeLifespan` | 60 s | Validade do código do Authorization Code. Curto de propósito: é trocado em milissegundos |
| `ssoSessionIdleTimeout` | 30 min | Sem atividade por 30 min, a sessão morre e o refresh token para de funcionar |
| `ssoSessionMaxLifespan` | 10 h | Mesmo ativo, depois de 10 h faz login de novo (uma jornada de trabalho) |
| `revokeRefreshToken` + `refreshTokenMaxReuse: 0` | ligado | **Rotação**: cada refresh token só vale uma vez. Se um refresh token for usado duas vezes, alguém o copiou, e o Keycloak invalida a sessão |

::: porque Por que 5 minutos
A API **não** consulta o Keycloak a cada requisição: confere a assinatura localmente. É isso que a torna rápida e independente, e é também por isso que **não dá para revogar** um access token já emitido. O tempo de vida curto é o mecanismo de revogação. Cinco minutos é o equilíbrio clássico: o refresh acontece em segundo plano, sem o usuário perceber, e o pior caso de um token vazado ou de uma role retirada é de cinco minutos.

Em crédito isso importa: se um analista é desligado às 14h, às 14h05 ele não aprova mais nada.
:::

::: previsao
A Carla (analista) foi promovida: o admin tirou a role `analista` e deu `admin` às 10h00. Ela está com a tela aberta desde 9h58, e o token dela foi emitido às 9h58. Às 10h01 ela tenta aprovar uma proposta. E às 10h04? O que ela precisa fazer para ver as telas de admin?
???
**10h01: aprova.** O token emitido às 9h58 ainda diz `analista` e vale até 10h03. A API não pergunta ao Keycloak.

**10h04: depende do refresh.** Quando a SPA renovou (por volta de 10h03), o Keycloak emitiu um token novo **com as roles atuais**: `admin`, sem `analista`. A aprovação passa, porque a policy `propostas:analisar` aceita `analista` **ou** `admin`. Se a policy aceitasse só `analista`, aqui ela levaria 403.

**Telas de admin:** aparecem no primeiro refresh depois das 10h00, sem novo login. Roles são lidas na emissão de cada token.
:::

## Usuários de teste

| Usuário | Senha | Roles |
|---|---|---|
| `ana.cliente`, `bruno.cliente` | `Senha@123` | `cliente` |
| `carla.analista` | `Senha@123` | `analista` |
| `otavio.operador` | `Senha@123` | `operador-financeiro` |
| `alice.admin` | `Senha@123` | `admin`, `analista` |

Dois clientes existem para você testar a regra "a Ana não vê a proposta do Bruno" (lição 3.5).

## Exportar depois de mexer no console

Mudou algo no console para experimentar e quer trazer para o código? Exporte:

```bash
docker compose exec keycloak /opt/keycloak/bin/kc.sh export --dir /tmp/export --realm creditflow --users realm_file
docker compose cp keycloak:/tmp/export/creditflow-realm.json ./export.json
```

O export traz **tudo**, inclusive ids internos, chaves e escopos padrão expandidos. Não substitua o arquivo do repositório pelo export: compare (`diff` com `jq -S`) e traga só o trecho que mudou. O arquivo do repositório é curto de propósito, para ser revisável.

## Perguntas para responder sem olhar

::: pergunta
Por que o `creditflow-web` é um client público e o `creditflow-backoffice` é confidencial?
???
O web roda no navegador, onde qualquer segredo fica visível; então não tem segredo e se protege com PKCE. O backoffice roda num servidor, que guarda segredo; então se autentica com `client_id` + segredo (ou chave privada) no client credentials.
:::

::: pergunta
Para que serve o client `creditflow-api`, se ele não faz login?
???
Para ser a audiência: o nome que vai no `aud` dos tokens e que a API exige. Garante que um token emitido para outra API do mesmo realm não seja aceito aqui.
:::

::: pergunta
Por que não dá para revogar um access token, e como o realm compensa?
???
A API valida a assinatura localmente, sem consultar o Keycloak, então um token emitido vale até expirar. O realm compensa com tempo de vida curto (5 min) e rotação de refresh token. Se precisar de revogação imediata, a API teria que usar introspecção (consulta ao Keycloak a cada chamada), pagando latência e dependência.
:::

**Próxima:** [3.3 Authorization Code + PKCE, passo a passo](03-pkce-passo-a-passo.md).
