# 1.5 Configuração e Options pattern

Arquivos: `Application/OrdersOptions.cs`, `appsettings.json`, `Program.cs`

## De onde vem a configuração

O ASP.NET junta várias fontes numa só, e **a última vence**:

```
appsettings.json
  → appsettings.{Ambiente}.json      (ex.: appsettings.Development.json)
    → user-secrets                   (só em Development; para senhas locais)
      → variáveis de ambiente        ← é assim que o Kubernetes configura seu pod
        → argumentos de linha de comando
```

O ambiente vem da variável `ASPNETCORE_ENVIRONMENT` (Development, Staging, Production). Sem ela,
o padrão é **Production**.

## Seções e o duplo underscore

```json
{ "Orders": { "MaxItemsPerOrder": 100 } }
```

A chave completa é `Orders:MaxItemsPerOrder`. Em variável de ambiente, o `:` vira `__`:

```bash
Orders__MaxItemsPerOrder=50 dotnet run --project src/OrderFlow.Orders.Api
```

No Windows (PowerShell):

```powershell
$env:Orders__MaxItemsPerOrder = "50"; dotnet run --project src/OrderFlow.Orders.Api
```

No Módulo 4, isso vira um `ConfigMap` do Kubernetes e, para segredos, um `Secret` ou o Key Vault.

## Options pattern: configuração tipada

Em vez de espalhar `configuration["Orders:MaxItemsPerOrder"]` (string, sem validação) pelo código:

```csharp
builder.Services
    .AddOptions<OrdersOptions>()
    .BindConfiguration("Orders")       // liga a seção à classe
    .ValidateDataAnnotations()         // aplica os [Range] da classe
    .ValidateOnStart();                // valida NA SUBIDA, não no primeiro uso
```

E quem precisa recebe `IOptions<OrdersOptions>` pela DI.

### Por que `ValidateOnStart` é coisa de produção

Teste:

```bash
Orders__MaxItemsPerOrder=0 dotnet run --project src/OrderFlow.Orders.Api
```

A aplicação **não sobe**:

```
OptionsValidationException: DataAnnotation validation failed for 'OrdersOptions' members:
'MaxItemsPerOrder' with the error: 'The field MaxItemsPerOrder must be between 1 and 500.'
```

No Kubernetes, um deploy com configuração errada fica em `CrashLoopBackOff` e **o rollout para**,
mantendo os pods antigos no ar. Sem `ValidateOnStart`, o pod sobe "saudável" e só quebra quando
o primeiro cliente real faz um pedido.

## As três interfaces de options

| Interface | Tempo de vida | Relê se o arquivo mudar? | Use quando |
|---|---|---|---|
| `IOptions<T>` | singleton | não | padrão; configuração fixa durante a vida do pod |
| `IOptionsSnapshot<T>` | scoped | sim, a cada requisição | configuração que muda sem redeploy (raro) |
| `IOptionsMonitor<T>` | singleton | sim, com evento de mudança | singletons que precisam reagir a mudança |

Em Kubernetes, o normal é `IOptions<T>`: mudou configuração, faz rollout de pods novos.

## Segredos

Senha **nunca** vai no `appsettings.json` (vai para o git). Local: `dotnet user-secrets`.
Produção: variável de ambiente vinda de um Secret do Kubernetes ou, melhor, Azure Key Vault com
Workload Identity (Módulo 6), sem nenhuma senha no cluster.

Próxima: [1.6 Minimal APIs, validação e Problem Details](06-minimal-apis.md)
