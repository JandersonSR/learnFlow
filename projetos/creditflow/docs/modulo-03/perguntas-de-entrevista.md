# Perguntas de entrevista do módulo 3

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão do módulo 2

::: pergunta
Por que o cálculo da simulação usa `decimal` e arredonda só na apresentação?
???
`double` é binário e não representa centavos exatamente; somas de milhares de parcelas acumulam erro. `decimal` é exato na base 10. Arredondar em cada passo intermediário propaga erro; arredonda-se na apresentação e ajusta-se a última parcela para fechar o total.
:::

## Identidade

::: entrevista
"Explique OAuth 2.0 e OpenID Connect para alguém do produto."
???
OAuth é dar a um aplicativo uma chave limitada e temporária para acessar algo em seu nome, sem entregar a senha. OpenID Connect é a parte que diz quem você é: um login padronizado em cima do OAuth, com um "crachá" (o ID token) que o aplicativo lê. Na nossa API, o aplicativo apresenta a chave (o access token) e a API confere quem emitiu, para quem é e até quando vale.
:::

::: entrevista
"Que fluxo você usa para uma SPA, e por quê?"
???
Authorization Code com PKCE S256, client público, sem implicit nem password. O código volta pela URL mas não serve sozinho: falta o `code_verifier`, que nunca saiu da SPA. Para dados sensíveis, prefiro um BFF: o fluxo roda num servidor como client confidencial e o navegador só tem um cookie `HttpOnly`; o token nunca chega ao JavaScript.
:::

::: entrevista
"O que a sua API valida num JWT?"
???
Assinatura com a chave do JWKS do emissor, achada pelo `kid`, só com os algoritmos que eu permito (RS256); `iss` exato; `aud` contendo a própria API; `exp` e `nbf` com folga pequena (30 s, não os 5 min padrão do .NET). Depois, autorização: policies por caso de uso e regras de recurso (o dono) no caso de uso.
:::

::: entrevista
"Como você revoga o acesso de alguém imediatamente?"
???
Com JWT validado localmente, não revogo o access token já emitido: ele vale até expirar. Por isso o access token vive 5 minutos e o refresh token é rotacionado; desabilitar o usuário corta novos tokens na hora. Se o negócio exige corte imediato, introspecção a cada chamada (latência e dependência do IdP) ou uma lista de bloqueio por `sub`/`sid` distribuída por evento. Escolho com o risco na mesa.
:::

::: entrevista
"A API funciona local e dá 401 em homologação. Como você investiga?"
???
Leio o `WWW-Authenticate` e o log do handler. Os suspeitos: `aud` sem a API (mapper de audiência no client), `iss` diferente porque o IdP está atrás de proxy ou é chamado por outro nome (hostname fixo no IdP, `Authority` público e metadata interno na API, cabeçalhos de proxy confiáveis), relógio fora (NTP), chave não encontrada (rotação mal feita ou realm recriado). Decodifico o token e comparo `iss`/`aud`/`exp` com a configuração.
:::

::: entrevista
"Como serviços falam entre si com segurança, sem usuário?"
???
Client credentials: cada serviço é um client confidencial com conta de serviço e as roles mínimas; pede token com seu segredo (de preferência `private_key_jwt` ou mTLS, sem segredo compartilhado), guarda o token e renova antes de expirar, em vez de pedir um por chamada. A API destino valida como qualquer token e sabe pelo `azp` que é uma máquina.
:::

::: entrevista
"Roles no token ou permissões na aplicação?"
???
Roles grossas no token (quem a pessoa é no negócio); permissões finas e limites (alçada em reais) na aplicação, consultados por `sub`. Isso mantém o token pequeno, permite mudar a regra sem esperar o token expirar, e não divide a regra entre dois sistemas.
:::

::: entrevista
"Por que 404 e não 403 quando um cliente pede a proposta de outro?"
???
403 confirma que o recurso existe, o que permite enumerar ids. 404 não revela nada. A regra de dono é de recurso, verificada no caso de uso depois da policy.
:::

::: entrevista
"Como você versiona a configuração do servidor de identidade?"
???
Realm como código no repositório, importado no ambiente local e no CI, revisado em pull request. Sei que o import só cria (realm existente é ignorado), então nos ambientes persistentes aplico mudanças pela API de administração ou por uma ferramenta declarativa, e segredos de clients ficam no cofre, não no JSON.
:::

**Próximo módulo:** [Módulo 4: persistência poliglota](../modulo-04/README.md).
