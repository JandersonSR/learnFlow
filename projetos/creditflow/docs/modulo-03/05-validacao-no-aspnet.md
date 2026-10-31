# 3.5 Validando no ASP.NET: JwtBearer, roles e policies

Tudo o que o script `valida.mjs` da lição anterior fazia, a API faz com o pacote `Microsoft.AspNetCore.Authentication.JwtBearer`. A configuração inteira mora num lugar só, o [`AutenticacaoExtensions.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Auth/AutenticacaoExtensions.cs), e o `Program.cs` só chama:

```csharp
builder.Services.AddAutenticacaoCreditFlow(builder.Configuration);
// ...
app.UseAutenticacaoCreditFlow();   // UseAuthentication + UseAuthorization, nesta ordem
```

::: porque Por que no BuildingBlocks, e não em cada módulo
Autenticação é uma decisão da **plataforma**: todos os módulos validam o mesmo emissor, a mesma audiência, do mesmo jeito. Se cada módulo configurasse a sua, cedo ou tarde um deles esqueceria de validar a audiência. Os módulos só **usam** o resultado: pedem uma policy no endpoint e leem o `ICurrentUser`.
:::

## A configuração

```json
"Auth": {
  "Authority": "http://localhost:8081/realms/creditflow",
  "Audience": "creditflow-api",
  "ExigirHttps": false
}
```

E o que ela vira, linha a linha:

```csharp
jwt.Authority = authority;                 // de onde baixar /.well-known/openid-configuration
jwt.Audience = auth.Audience;
jwt.RequireHttpsMetadata = auth.ExigirHttps;
jwt.MapInboundClaims = false;

var p = jwt.TokenValidationParameters;
p.ValidIssuers = [authority, .. auth.EmissoresAdicionais];
p.ValidAudience = auth.Audience;
p.ValidateLifetime = true;
p.RequireExpirationTime = true;
p.RequireSignedTokens = true;
p.ValidAlgorithms = ["RS256"];
p.ClockSkew = TimeSpan.FromSeconds(auth.FolgaDeRelogioSegundos);   // 30 s
p.NameClaimType = "preferred_username";
p.RoleClaimType = "role";
```

| Linha | Por quê |
|---|---|
| `Authority` | O JwtBearer baixa a descoberta e o JWKS dali, e renova sozinho |
| `RequireHttpsMetadata` | Padrão `true`: recusa baixar chaves por HTTP, porque quem controla a rede trocaria as chaves. O Keycloak local é HTTP, então `false` **só** no `appsettings.Development.json` |
| `MapInboundClaims = false` | Sem isso, o handler renomeia `sub` para `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier` (herança do WS-Federation) e o seu `FindFirst("sub")` volta `null` |
| `ValidIssuers` | O `iss` tem que bater **exatamente**. A lista existe para uma migração de hostname; normalmente tem um item |
| `ValidAlgorithms` | A defesa contra confusão de algoritmo (lição 3.4) |
| `ClockSkew = 30 s` | O padrão do .NET é **5 minutos**. Com token de 5 min de vida, a folga padrão dobraria a validade real. 30 s cobre relógio de servidor com NTP |
| `NameClaimType`/`RoleClaimType` | Dizem ao `ClaimsPrincipal` qual claim é o nome (`User.Identity.Name`) e qual é a role (`User.IsInRole`) |

::: armadilha `AddOptions<JwtBearerOptions>().Configure<IOptions<AuthOpcoes>>`
Repare que a configuração do JwtBearer não é feita dentro do `AddJwtBearer(o => ...)` com valores lidos na hora. Ela é registrada como *options* que dependem de `AuthOpcoes`. Assim, um teste de integração que troca `Auth:Authority` (para apontar para o Keycloak do Testcontainers, no módulo 4) é respeitado, e o `ValidateOnStart` faz a API **não subir** com `Authority` vazio, em vez de subir e responder 401 para tudo.
:::

## Roles: o Keycloak põe onde o .NET não procura

O Keycloak entrega as roles **aninhadas**: `"realm_access": { "roles": ["cliente", ...] }`. O ASP.NET procura claims **planas** do tipo configurado em `RoleClaimType`. Sem tradução, `User.IsInRole("cliente")` é sempre `false` e toda policy por role dá 403.

A tradução acontece no evento `OnTokenValidated`, que roda **uma vez por requisição, depois** que o token foi validado:

```csharp
OnTokenValidated = ctx =>
{
    if (ctx.Principal?.Identity is ClaimsIdentity identidade)
        identidade.AddClaims(ClaimsKeycloak.PapeisDoRealm(ctx.Principal, emissor).ToList());
    return Task.CompletedTask;
}
```

O [`ClaimsKeycloak.PapeisDoRealm`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Auth/ClaimsKeycloak.cs) lê a claim `realm_access` (que o `JsonWebTokenHandler` entrega como um texto JSON) e devolve uma claim `role` por papel.

::: porque Por que `OnTokenValidated` e não `IClaimsTransformation`
O `IClaimsTransformation` roda a cada chamada de `AuthenticateAsync`, que pode acontecer mais de uma vez por requisição, e precisa ser idempotente (não duplicar claims). O evento do JwtBearer roda exatamente uma vez, só para tokens válidos, e só para este esquema de autenticação. Se um dia houver um segundo esquema (um cookie do BFF, por exemplo), cada um traduz o seu.
:::

## Policies por caso de uso

O endpoint nunca diz "precisa de `analista`". Ele diz **o que** está sendo feito:

```csharp
grupo.MapPost("/{id:guid}/aprovar", AprovarProposta.Executar)
     .RequireAuthorization(Politicas.AnalisarProposta);
```

E o **quem** está num lugar só, o [`Politicas.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Auth/Politicas.cs):

```csharp
o.AddPolicy(AnalisarProposta, p => p.RequireAuthenticatedUser().RequireRole(Papeis.Analista, Papeis.Admin));
```

::: porque Policy, não role
No dia em que o negócio decidir "operador financeiro também pode aprovar propostas de até R$ 5.000", você muda **uma** policy, e não procura `RequireRole("analista")` em 14 endpoints. E a policy pode crescer para além de roles: exigir `acr` (autenticação forte) para contratar, ou exigir que o token venha de `azp = creditflow-web`.
:::

| Policy | Quem passa | Usada em |
|---|---|---|
| `propostas:criar`, `propostas:contratar` | `cliente` | `POST /v1/propostas`, `POST /v1/propostas/{id}/contratar` |
| `propostas:consultar` | `cliente`, `analista`, `admin` | `GET /v1/propostas/{id}` |
| `propostas:analisar` | `analista`, `admin` | aprovar, recusar, fila de análise |
| `pagamentos:operar` | `operador-financeiro` | Pagamentos (módulo 6) |

## 401 × 403

| Status | Significa | Exemplo |
|---|---|---|
| **401** Unauthorized | "Não sei quem você é." Sem token, token inválido, expirado, audiência errada | Cabeçalho `WWW-Authenticate: Bearer error="invalid_token", error_description="The audience 'account' is invalid"` |
| **403** Forbidden | "Sei quem você é, e você não pode." Token válido, policy não satisfeita | A Ana (cliente) tentando aprovar |

::: dica O `WWW-Authenticate` é o seu melhor amigo
Num 401, o JwtBearer escreve **o motivo** no cabeçalho `WWW-Authenticate` (*The issuer '...' is invalid*, *The token expired at '...'*, *The signature key was not found*). Comece todo diagnóstico com `curl -si` e leia o cabeçalho. O motivo completo, com o código `IDX...` da biblioteca, vai para o log da API pelo `OnAuthenticationFailed`.
:::

## Role não é tudo: a regra do dono

A Ana e o Bruno são `cliente`. Os dois passam na policy `propostas:consultar`. Mas a Ana não pode ver a proposta do Bruno. Isso não é uma regra de **role**, é uma regra de **recurso**: depende de qual proposta.

No handler de consulta (módulo 4):

```csharp
if (!usuario.TemPapel(Papeis.Analista) && !usuario.TemPapel(Papeis.Admin) && proposta.SolicitanteId != usuario.Id)
    return Results.NotFound();
```

::: porque 404, não 403
Responder 403 confirma que a proposta **existe**. Com ids sequenciais, isso permitiria enumerar as propostas do sistema. Um 404 não diz nada. (Os ids do CreditFlow são UUID v7, difíceis de adivinhar, mas defesa em profundidade custa uma linha.)
:::

## `ICurrentUser`: o domínio não conhece `HttpContext`

```csharp
public interface ICurrentUser
{
    bool Autenticado { get; }
    string? Id { get; }          // sub
    string? Nome { get; }        // preferred_username
    string? ClienteOAuth { get; } // azp
    bool EhMaquina { get; }
    IReadOnlyCollection<string> Papeis { get; }
    bool TemPapel(string papel);
}
```

Handlers recebem `ICurrentUser` por injeção. No teste de unidade, você passa uma implementação falsa com o `sub` que quiser, sem montar `HttpContext` nem token.

## Máquina a máquina: client credentials

O `creditflow-backoffice` não tem usuário. Ele pega um token assim:

```bash
curl -s localhost:8081/realms/creditflow/protocol/openid-connect/token \
  -d grant_type=client_credentials -d client_id=creditflow-backoffice \
  -d client_secret=backoffice-segredo-so-para-dev-local | jq -r .access_token > /tmp/m2m.txt
jwt "$(cat /tmp/m2m.txt)"   # a função da lição 3.4
```

O token tem `azp: creditflow-backoffice`, `preferred_username: service-account-creditflow-backoffice`, `realm_access.roles: ["operador-financeiro", ...]`, e **não tem refresh token** (o client pede outro quando este expirar; o atributo `client_credentials.use_refresh_token: false` deixa isso explícito).

::: armadilha Token M2M por chamada
O erro clássico do backoffice: pedir um token novo **a cada chamada** à API. Com 50 chamadas por segundo, são 50 logins por segundo no Keycloak. O certo é guardar o token e renovar um pouco antes de expirar (por exemplo, quando faltar 30 s). No .NET, o pacote `Duende.AccessTokenManagement` faz isso; em Node, uma variável com o token e o `exp`.
:::

::: video The Simplest Way to Add Keycloak Authentication to Your .NET API (Milan Jovanović, em inglês)
https://www.youtube.com/watch?v=HAvCoQ0tOTs
Keycloak + JwtBearer numa API .NET, incluindo a questão do endereço interno do Keycloak (o *backchannel*) que você verá na próxima lição.
:::

Documentação: [Configurar autenticação JWT Bearer no ASP.NET Core](https://learn.microsoft.com/aspnet/core/security/authentication/configure-jwt-bearer-authentication) e [autorização baseada em policy](https://learn.microsoft.com/aspnet/core/security/authorization/policies).

## Perguntas para responder sem olhar

::: pergunta
Por que `User.IsInRole("analista")` volta `false` mesmo com a role no token, numa API recém-configurada com Keycloak?
???
Porque o Keycloak entrega as roles aninhadas em `realm_access.roles`, e o ASP.NET procura claims planas do tipo `RoleClaimType`. É preciso traduzir (no `OnTokenValidated` ou num `IClaimsTransformation`) e configurar o `RoleClaimType` para o tipo criado.
:::

::: pergunta
Qual a diferença entre 401 e 403, e onde você procura o motivo de um 401?
???
401: a API não aceitou a identidade (sem token, inválido, expirado, audiência ou emissor errados). 403: identidade aceita, permissão negada. O motivo de um 401 vem no cabeçalho `WWW-Authenticate` (`error_description`) e, completo, no log do handler.
:::

::: pergunta
Por que o `ClockSkew` padrão de 5 minutos é ruim para tokens de 5 minutos?
???
Porque a folga é somada à validade: o token passaria a valer até 10 minutos, dobrando a janela de um token vazado. Com NTP, 30 segundos bastam.
:::

**Próxima:** [3.6 Armadilhas e lab de quebra](06-armadilhas-e-lab-de-quebra.md).
