# Desafio do módulo 3: o limite de alçada do analista

::: desafio Alçada por valor
O negócio decidiu: **analista** aprova propostas de até **R$ 20.000**; acima disso, só **admin** (ou um analista sênior, papel que ainda não existe). Recusar continua liberado para qualquer analista.

Implemente, sem roteiro:

1. A regra no lugar certo (você decide: policy com requisito próprio, regra de recurso no handler, ou role nova no Keycloak; justifique a escolha por escrito no ADR 0003).
2. Se você criar papel novo, ele nasce **no realm como código** e chega à API sem mudar nenhum endpoint.
3. Um analista tentando aprovar R$ 25.000 recebe uma resposta que o front consiga explicar ao usuário (não um 500, não um 404).
4. A mudança não pode deixar o token maior para todos os usuários.

**Critérios de aceite**

- [ ] Teste que prova: `carla.analista` aprova R$ 15.000, **não** aprova R$ 25.000, **recusa** R$ 25.000
- [ ] Teste que prova: `alice.admin` aprova R$ 25.000
- [ ] O status e o corpo da resposta negada estão documentados no OpenAPI do endpoint
- [ ] O realm reimportado do zero (`docker compose up -d --force-recreate keycloak`) já tem tudo o que é preciso
- [ ] Um parágrafo no ADR: por que você **não** colocou o limite em reais como claim no token
:::

::: dica Dica 1
"Pode aprovar?" depende de **duas** coisas: quem é (role) e qual proposta (valor). O ASP.NET tem um mecanismo próprio para autorização que depende do recurso: `IAuthorizationService.AuthorizeAsync(user, recurso, requisito)`, com um `AuthorizationHandler<TRequisito, TRecurso>`.
:::

::: dica Dica 2
403 com `ProblemDetails` e um `type`/código estável (por exemplo `propostas.alcada-excedida`) é o que o front consegue traduzir. Um 404 aqui esconderia uma informação que o analista legitimamente tem: a proposta existe, ele está vendo ela na fila.
:::

::: solucao Um desenho possível
- **Role nova `analista-senior`** no realm (é papel de negócio, vale ser role), e a policy `propostas:analisar` continua aceitando `analista`, `analista-senior` e `admin`: quem entra na tela não muda.
- **Requisito de recurso** `AlcadaDeAprovacao(limite)` com um `AuthorizationHandler<AlcadaDeAprovacao, Proposta>`: passa se o usuário é `admin` ou `analista-senior`, ou se é `analista` e `proposta.ValorSolicitado <= 20.000`. O limite vem de configuração (`Propostas:AlcadaAnalista`), não do token.
- No handler de aprovação, depois de carregar a proposta: `var r = await autorizacao.AuthorizeAsync(httpContext.User, proposta, new AlcadaDeAprovacao());` e, se falhar, `403` com `ProblemDetails` de código `propostas.alcada-excedida`.
- **Por que não claim de limite no token:** o limite mudaria por decisão de negócio e levaria até 5 min para valer (o token vive isso), cresceria o token de todos, e a regra ficaria dividida entre dois sistemas. Role diz **quem é**; quanto essa pessoa pode, a aplicação decide.
:::
