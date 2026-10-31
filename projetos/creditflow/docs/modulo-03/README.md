# Módulo 3: identidade com Keycloak

**Objetivo:** entender o que acontece entre "o usuário clicou em Entrar" e "a API respondeu 200", peça por peça: o protocolo (OAuth 2.0 e OpenID Connect), o servidor de identidade (Keycloak), o token (JWT) e quem o confere (o JwtBearer do ASP.NET). No fim, você sabe configurar, explicar e, principalmente, **diagnosticar** um 401.

## O que você vai conseguir fazer no fim

- Explicar a diferença entre OAuth 2.0 e OpenID Connect, e entre access token, ID token e refresh token
- Ler o realm do CreditFlow como código e justificar cada client, role, mapper e tempo de token
- Fazer um Authorization Code + PKCE **à mão**, com `curl`, e explicar o que o PKCE impede
- Abrir um JWT, conferir a assinatura com o JWKS e dizer o que cada claim significa
- Explicar cada linha do `AddAutenticacaoCreditFlow` e por que os endpoints pedem *policies*, não *roles*
- Fazer uma chamada máquina-a-máquina com client credentials
- Diagnosticar os quatro 401 clássicos: audience, issuer atrás de proxy, relógio e chave rotacionada

## O que você constrói

- O realm `creditflow` como código: [`deploy/local/keycloak/creditflow-realm.json`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/local/keycloak/creditflow-realm.json)
- A autenticação compartilhada por todos os módulos: [`src/BuildingBlocks/CreditFlow.BuildingBlocks/Auth/`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Auth/AutenticacaoExtensions.cs)
- Endpoints de Propostas protegidos por policy (o módulo em si é o assunto do [módulo 4](../modulo-04/README.md))
- O ADR [`docs/adr/0003-keycloak.md`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0003-keycloak.md)

## Pré-requisitos

- Módulos 1 e 2 (solução rodando no `docker compose`, módulo Simulação)
- `curl`, `jq` e Node.js 20+ na máquina (para os labs; nada de SDK extra)
- Saber o que é HTTP, cabeçalho e cookie. O resto a gente constrói aqui.

## Lições

| # | Lição | Tempo |
|---|---|---|
| 3.1 | [OAuth 2.0 e OpenID Connect na prática](01-oidc-na-pratica.md) | 50 min |
| 3.2 | [O realm como código: clients, roles, scopes e tempos](02-realm-como-codigo.md) | 60 min |
| 3.3 | [Authorization Code + PKCE, passo a passo](03-pkce-passo-a-passo.md) | 60 min |
| 3.4 | [JWT por dentro](04-jwt-por-dentro.md) | 45 min |
| 3.5 | [Validando no ASP.NET: JwtBearer, roles e policies](05-validacao-no-aspnet.md) | 60 min |
| 3.6 | [Armadilhas e lab de quebra](06-armadilhas-e-lab-de-quebra.md) | 75 min |
| — | [Desafio do módulo](desafio.md) | 2–3 h |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 30 min |

Tempo estimado: **8 a 9 horas**, contando o desafio.

## Entregável do módulo

O desafio resolvido e um parágrafo no ADR 0003 respondendo: **"se amanhã trocarmos o Keycloak por Entra ID, o que muda no código da API?"** (a resposta certa é "quase nada", e você precisa saber dizer o que é esse "quase").
