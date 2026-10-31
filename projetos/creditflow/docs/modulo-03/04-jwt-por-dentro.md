# 3.4 JWT por dentro

O access token que você pegou na lição anterior é uma string de uns 1.000 caracteres com dois pontos no meio. Esta lição abre essa string, confere a assinatura com as próprias mãos e mostra o que a API olha em cada pedaço.

## Três partes, separadas por ponto

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ii4uLiJ9 . eyJleHAiOjE3OTk... . kV3x9Q...
        cabeçalho (BASE64URL de JSON)                     payload             assinatura
```

```bash
TOKEN=$(jq -r .access_token /tmp/tokens.json)
jwt() { node -e 'const [h,p]=process.argv[1].split(".");for(const x of [h,p])console.log(JSON.stringify(JSON.parse(Buffer.from(x,"base64url")),null,2))' "$1"; }
jwt "$TOKEN"
```

::: conceito JWT, JWS e JWE
**JWT** (RFC 7519) é o formato das claims. Quase sempre ele vem como **JWS** (assinado: qualquer um **lê**, ninguém **altera** sem invalidar a assinatura). Existe também o **JWE** (cifrado: ninguém lê sem a chave), raro em access token. O token do Keycloak é JWS: **não coloque segredo em claim**. Base64 não é criptografia.
:::

## O cabeçalho

```json
{ "alg": "RS256", "typ": "JWT", "kid": "Hk8wR...Q" }
```

| Campo | Significa | O que a API faz |
|---|---|---|
| `alg` | Algoritmo da assinatura. `RS256` = RSA com SHA-256: o Keycloak assina com a chave **privada**, qualquer um confere com a **pública** | Só aceita `RS256` (`ValidAlgorithms`). Nunca `none`, nunca `HS256` |
| `kid` | *Key id*: qual das chaves do realm assinou | Procura a chave com esse `kid` no JWKS |

::: armadilha Os dois ataques clássicos de `alg`
1. **`alg: none`**: o atacante remove a assinatura e declara que o token não é assinado. Bibliotecas antigas aceitavam.
2. **Troca RS256 → HS256**: o atacante assina com HMAC usando **a chave pública** (que é pública!) como segredo. Uma biblioteca que usa "a chave configurada" com "o algoritmo do cabeçalho" confere e aceita.

A defesa é a mesma: o **validador** decide o algoritmo, não o token. O `ValidAlgorithms = ["RS256"]` da API está lá por isso.
:::

## O JWKS: de onde vem a chave pública

```bash
curl -s localhost:8081/realms/creditflow/protocol/openid-connect/certs | jq '.keys[] | {kid, kty, alg, use}'
```

Você verá duas chaves: uma `RS256` com `use: sig` (assina tokens) e uma `RSA-OAEP` com `use: enc` (cifra, não usada aqui). O JwtBearer baixa esse documento uma vez, guarda em memória e, quando chega um token com `kid` que ele não conhece, baixa de novo (no máximo uma vez a cada 5 minutos, por padrão). É isso que permite ao Keycloak **rotacionar chaves** sem derrubar a API (lição 3.6).

## O payload: as claims

Um access token da Ana, resumido:

```json
{
  "exp": 1793284800, "iat": 1793284500, "auth_time": 1793284498,
  "jti": "onrtac:9a1f...",
  "iss": "http://localhost:8081/realms/creditflow",
  "aud": ["creditflow-api", "account"],
  "sub": "5d0c3a8e-6b1e-4c1f-9d7e-2f3c1b0a9e11",
  "typ": "Bearer",
  "azp": "creditflow-web",
  "sid": "b3f1...",
  "realm_access": { "roles": ["cliente", "default-roles-creditflow", "offline_access", "uma_authorization"] },
  "scope": "openid profile email",
  "preferred_username": "ana.cliente",
  "email": "ana.cliente@creditflow.local"
}
```

| Claim | Significa | A API usa para |
|---|---|---|
| `iss` | Quem emitiu | Conferir que veio **deste** realm. Comparação de string exata |
| `aud` | Para quem é | Conferir que contém `creditflow-api` |
| `exp`, `iat`, `nbf` | Expira em, emitido em, não antes de (segundos Unix) | Validade, com folga de relógio |
| `sub` | Id **estável** do usuário no realm | Dono dos dados: a proposta guarda o `sub` da Ana |
| `azp` | *Authorized party*: o client que pediu o token | Saber se é a SPA ou o backoffice (log, auditoria) |
| `realm_access.roles` | Roles de realm | Virar claims `role` (lição 3.5) |
| `preferred_username` | Login | **Só** exibir e registrar |

::: armadilha Use `sub`, nunca e-mail ou username, como chave
E-mail muda (a pessoa casa, troca de provedor). Username pode ser editável. Se a proposta guardar o e-mail como dono, a Ana troca o e-mail e perde as propostas, ou pior: alguém cadastra o e-mail antigo e ganha as propostas dela. O `sub` é um UUID que o Keycloak nunca reaproveita.
:::

::: armadilha `default-roles-creditflow`, `offline_access`, `uma_authorization`
Essas roles aparecem em todo usuário: são a role composta padrão do realm e as que ela inclui. Não são do negócio. A API as recebe como claims `role` e simplesmente não há policy que as use. Não as remova do realm: o `offline_access` é o que permite pedir `scope=offline_access` (refresh token de longa duração), e o console do Keycloak conta com elas.
:::

## Conferindo a assinatura à mão

Para tirar o "mágico" da validação, faça a API de papel em 15 linhas de Node:

```bash
mkdir -p /tmp/jwt-lab && cd /tmp/jwt-lab && npm init -y >/dev/null && npm i jose >/dev/null
cat > valida.mjs <<'EOF'
import { createRemoteJWKSet, jwtVerify } from 'jose';
const jwks = createRemoteJWKSet(new URL('http://localhost:8081/realms/creditflow/protocol/openid-connect/certs'));
try {
  const { payload, protectedHeader } = await jwtVerify(process.argv[2], jwks, {
    issuer: 'http://localhost:8081/realms/creditflow',
    audience: 'creditflow-api',
    algorithms: ['RS256'],
    clockTolerance: 30,
  });
  console.log('VÁLIDO', protectedHeader.kid, payload.sub, payload.realm_access?.roles);
} catch (e) { console.log('RECUSADO', e.code, e.message); }
EOF
node valida.mjs "$TOKEN"
```

Esse script faz exatamente o que o JwtBearer faz: baixa o JWKS, acha a chave pelo `kid`, confere a assinatura, `iss`, `aud`, `exp` com 30 s de folga e o algoritmo.

::: previsao
Rode o `valida.mjs` com estas variações. Preveja cada resultado antes:

1. O token, com o último caractere trocado.
2. O token, com o payload trocado por outro em que `realm_access.roles` tem `admin` (edite o JSON, recodifique em base64url, monte `cabeçalho.payloadNovo.assinaturaAntiga`).
3. O ID token (`jq -r .id_token /tmp/tokens.json`) em vez do access token.
4. O access token depois de 6 minutos.
???
1. **Recusado**, `ERR_JWS_SIGNATURE_VERIFICATION_FAILED` (às vezes `ERR_JWS_INVALID`, se o caractere quebrar o base64url).
2. **Recusado**, `ERR_JWS_SIGNATURE_VERIFICATION_FAILED`. A assinatura cobre `cabeçalho.payload`; mudou um byte, a conta não fecha. É por isso que a API pode confiar nas roles do token sem consultar ninguém.
3. **Recusado**, `ERR_JWT_CLAIM_VALIDATION_FAILED` no `aud`: o ID token é para `creditflow-web`. (Ele tem a mesma assinatura válida; o que o barra é o destinatário.)
4. **Recusado**, `ERR_JWT_EXPIRED`: 300 s de vida + 30 s de folga < 360 s.

Rodamos esses quatro casos (e mais `alg: none`, `kid` desconhecido e emissor diferente) numa simulação com `jose`, emitindo tokens no formato do Keycloak; todos se comportaram como acima.
:::

## O tamanho importa

O access token da Ana tem por volta de 1 KB. Ele vai em **toda** requisição. Cada role, cada grupo, cada claim que alguém acrescenta "por conveniência" cresce o cabeçalho, e servidores e proxies têm limite (o Kestrel aceita 32 KB de cabeçalhos por padrão; o NGINX recusa linhas de cabeçalho acima de 8 KB com a configuração padrão de `large_client_header_buffers`). O sintoma é estranho: um usuário específico, com muitos grupos, recebe `431` ou `400 Request Header Or Cookie Too Large` e todos os outros funcionam.

::: dica
Token carrega **identidade e papéis grossos**. Permissões finas ("pode aprovar até R$ 20.000") ficam na aplicação, consultadas por `sub`. Isso mantém o token pequeno e permite mudar a permissão sem esperar o token expirar.
:::

## Perguntas para responder sem olhar

::: pergunta
Um JWT assinado é seguro para guardar o CPF do cliente numa claim?
???
Não. JWS é assinado, não cifrado: qualquer um que tenha o token lê o payload com um decodificador de base64url. A assinatura garante integridade, não sigilo. Dado sensível não vai no token.
:::

::: pergunta
Como a API sabe qual chave usar para conferir a assinatura, e o que acontece quando o Keycloak troca a chave?
???
Pelo `kid` do cabeçalho, procurado no JWKS do realm (que a API baixa e guarda). Quando chega um `kid` desconhecido, o JwtBearer baixa o JWKS de novo e acha a chave nova. Por isso a rotação funciona sem reiniciar a API, desde que a chave antiga continue publicada até os tokens assinados com ela expirarem.
:::

::: pergunta
O que é o ataque de confusão de algoritmo, e como se evita?
???
O atacante muda o `alg` do cabeçalho (para `none`, ou de RS256 para HS256 usando a chave pública como segredo HMAC) e uma biblioteca ingênua aceita. Evita-se fixando no validador os algoritmos aceitos, sem confiar no cabeçalho.
:::

**Próxima:** [3.5 Validando no ASP.NET](05-validacao-no-aspnet.md).
