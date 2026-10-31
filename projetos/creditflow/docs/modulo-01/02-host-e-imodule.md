# 1.2 O Host e o `IModule`: um processo, N perfis

O Host é o único executável do CreditFlow, e ele **não tem regra de negócio**. O trabalho dele é: descobrir quais módulos este processo deve rodar, ligar o que é transversal (autenticação, mensageria, observabilidade, OpenAPI, tratamento de erro) e pedir a cada módulo que se registre. Esta lição lê o [`Program.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Host/CreditFlow.Host/Program.cs) de cima a baixo.

## O contrato entre o Host e um módulo

```csharp
public interface IModule
{
    string Nome { get; }
    void Registrar(IServiceCollection services, IConfiguration configuration);
    void Mapear(IEndpointRouteBuilder endpoints);
}
```

::: conceito IModule
O ponto de entrada de um módulo. `Registrar` coloca no contêiner de injeção de dependência (DI) tudo o que o módulo precisa: casos de uso, repositórios, `DbContext`, consumidores. `Mapear` declara os endpoints HTTP. O Host conhece **só** este tipo de cada módulo; o resto (domínio, banco, endpoints) é detalhe interno.
:::

Se você vem do NestJS, é o `@Module()` com `providers` e `controllers`, só que explícito: em vez de decoradores e varredura, uma classe com dois métodos. Veja o [`SimulacaoModule.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/SimulacaoModule.cs):

```csharp
public sealed class SimulacaoModule : IModule, IModuloComContratos
{
    public string Nome => "Simulacao";

    public void Registrar(IServiceCollection services, IConfiguration configuration)
    {
        RegistrarContratos(services, configuration);
        services.AddScoped<SimularEmprestimo>();
        services.AddScoped<ObterSimulacao>();
        // ... publicador de eventos e a política de rate limit
    }

    public void Mapear(IEndpointRouteBuilder endpoints) => SimulacaoEndpoints.Mapear(endpoints);
}
```

## O catálogo é explícito

```csharp
IModule[] catalogo =
[
    new ClientesModule(),
    new SimulacaoModule(),
    new PropostasModule(),
    new PagamentosModule(),
    new NotificacoesModule(),
];
```

::: porque Por que uma lista escrita à mão, e não varrer os assemblies por reflexão
A alternativa "mágica" é procurar todos os tipos que implementam `IModule` nos assemblies carregados. Três problemas:

1. **Assembly não referenciado não é carregado.** O .NET carrega um assembly quando algum código o usa. Se nada no Host toca o tipo do módulo, a DLL pode nem estar carregada na hora da varredura, e o módulo some sem erro.
2. **Trimming e AOT** (publicar só o código usado) removem o que ninguém referencia estaticamente.
3. **Legibilidade.** Quem abre o `Program.cs` sabe, em cinco linhas, tudo o que o sistema tem. Módulo novo é uma linha nova num lugar óbvio, e aparece no diff do pull request.
:::

## O perfil de execução

```csharp
var perfil = PerfilDeExecucao.Ler(builder.Configuration, catalogo);
```

O [`PerfilDeExecucao`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Modulos/PerfilDeExecucao.cs) lê duas chaves:

| Chave | Variável de ambiente | Valores | Padrão |
|---|---|---|---|
| `CreditFlow:Modulos` | `CREDITFLOW__MODULOS` | lista separada por vírgula, ou array no JSON | vazio = todos |
| `CreditFlow:Papel` | `CREDITFLOW__PAPEL` | `api` ou `worker` | `api` |

::: conceito O `__` nas variáveis de ambiente
A configuração do .NET é uma árvore de chaves separadas por `:`. Como `:` não é permitido em nome de variável de ambiente em todo sistema operacional, o provider de variáveis de ambiente troca `__` (dois sublinhados) por `:`. `CREDITFLOW__MODULOS` vira `CreditFlow:Modulos` (a busca não diferencia maiúsculas). Visto a fundo em [Plataforma, módulo 1](../../../plataforma-dotnet/docs/modulo-01/02-anatomia-do-projeto.md).
:::

E ele **recusa** o que não entende:

```csharp
if (desconhecidos.Count > 0)
    throw new InvalidOperationException(
        $"CreditFlow:Modulos tem módulo desconhecido: {string.Join(", ", desconhecidos)}. ...");
```

::: previsao
No Helm, alguém escreve `CREDITFLOW__MODULOS=Simulaçao` (com cedilha). Suponha que o `Ler` **ignorasse** nomes desconhecidos em vez de lançar exceção. O que acontece no cluster?
???
O pod sobe com **zero módulos**. O `/healthz/live` responde 200 (o processo está vivo), o `/healthz/ready` responde 200 (nenhuma dependência registrada para checar). O Kubernetes considera o pod saudável e o Ingress manda tráfego de `/v1/simulacoes` para ele, que responde **404 para tudo**. O alerta que dispara é "taxa de 404 alta", e a primeira suspeita de qualquer um vai ser o Ingress.

Lançando exceção, o processo morre na subida, o pod entra em `CrashLoopBackOff`, o `kubectl logs` mostra a mensagem com os nomes conhecidos, e o deploy anterior continua atendendo (o rollout não avança). **Falhar cedo e alto** transforma um incidente de meia hora em um deploy que não passou.
:::

## Contratos fora do perfil

O pod `api-simulacao` roda só o módulo Simulacao. Mas simular para um cliente cadastrado precisa do score dele, que é de Clientes, consultado por `IConsultaDeClientes`. Quem registra essa interface no DI, se Clientes não está ativo?

```csharp
public static IServiceCollection AddModulos(this IServiceCollection services, IConfiguration configuration,
    IReadOnlyCollection<IModule> catalogo, PerfilDeExecucao perfil)
{
    services.AddSingleton(perfil);
    foreach (var modulo in catalogo)
    {
        if (perfil.Executa(modulo.Nome))
            modulo.Registrar(services, configuration);
        else if (modulo is IModuloComContratos comContratos)
            comContratos.RegistrarContratos(services, configuration);
    }
    return services;
}
```

Um módulo que oferece interface síncrona implementa `IModuloComContratos`. Fora do perfil, o Host chama só `RegistrarContratos`: o mínimo para atender a interface (no caso de Clientes, o repositório de leitura), sem endpoints, consumidores ou jobs.

::: porque Por que assim, e não uma chamada HTTP para o api-geral
Três opções foram pesadas no [ADR 0002](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0002-perfis-de-execucao.md):

| Opção | Ganha | Paga |
|---|---|---|
| HTTP para o pod que tem Clientes | Deploy independente | Latência, timeout, retry, e o api-simulacao cai quando o api-geral cai |
| Cópia local do score por eventos | O mais desacoplado; é o caminho de uma futura extração | Consistência eventual e mais um consumidor para manter |
| **Registrar só o contrato** (escolhida) | Simples, consistente, sem rede | O pod api-simulacao precisa de conexão com o Postgres e leitura no schema `clientes` |

Para um sistema que ainda é um monolito, a terceira é a mais barata. O dia em que Simulação virar um serviço separado, a interface `IConsultaDeClientes` continua igual: muda só a implementação (para HTTP ou cópia local).
:::

::: armadilha
`RegistrarContratos` **nunca** registra hosted service ou consumidor Kafka. Se registrasse, o pod api-simulacao passaria a consumir eventos de Clientes ou rodar jobs de Clientes sem ninguém ter pedido, e você teria o mesmo job rodando em dois deployments.
:::

## A ordem do `Program.cs`

```csharp
builder.AddObservabilidade();                                  // 1. primeiro: tudo depois já é rastreado
builder.Services.AddAutenticacaoCreditFlow(builder.Configuration);
builder.Services.AddMensageria(builder.Configuration);        // 2. antes dos módulos (ver abaixo)
builder.Services.AddProblemDetails(...);
builder.Services.AddOpenApi(...);
builder.Services.AddRateLimiter(...);
builder.Services.AddHealthChecks();
builder.Services.AddModulos(builder.Configuration, catalogo, perfil);   // 3. os módulos

var app = builder.Build();
app.UseExceptionHandler();            // a. pega exceção de tudo que vem depois
app.UseStatusCodePages();             // b. 401/404 sem corpo viram ProblemDetails
app.UseAutenticacaoCreditFlow();      // c. quem é você? pode?
app.UseRateLimiter();                 // d. limite por política do endpoint
app.MapHealthChecks("/healthz/live", ...);
app.MapHealthChecks("/healthz/ready", ...);
if (perfil.EhApi) { app.MapOpenApi(); app.MapScalarApiReference(); }
app.MapModulos(catalogo, perfil);     // e. endpoints só no papel api
```

::: porque Por que a Mensageria antes dos módulos
Hosted services (serviços em segundo plano) são **iniciados na ordem de registro e parados na ordem inversa**. A Mensageria registra o "esvaziador do produtor", que no desligamento espera as mensagens pendentes saírem para o Kafka. Os módulos registram relays de outbox e consumidores, que publicam. Registrando a Mensageria primeiro, ela para **por último**: quando o esvaziador roda, ninguém mais está publicando. Ao contrário, as últimas mensagens do relay se perderiam no desligamento do pod.
:::

::: conceito Middleware
Cada `app.Use...` adiciona uma etapa no caminho da requisição, que roda na ordem em que foi adicionada (e a resposta volta na ordem inversa). É o mesmo modelo do Express: `app.use(a); app.use(b)`. Por isso `UseExceptionHandler` vem primeiro: ele envolve todas as etapas seguintes num `try/catch`.
:::

::: quebra Lab: o perfil que não existe
```bash
CREDITFLOW__MODULOS=Simulacao,Cobranca dotnet run --project src/Host/CreditFlow.Host
CREDITFLOW__PAPEL=batch dotnet run --project src/Host/CreditFlow.Host
CREDITFLOW__MODULOS=simulacao dotnet run --project src/Host/CreditFlow.Host
```
Antes de rodar: quais sobem? O terceiro sobe com qual nome de módulo no log de inicialização?
:::

::: solucao
Os dois primeiros morrem na subida com `InvalidOperationException` e a lista do que é válido. O terceiro sobe: a comparação ignora maiúsculas, e o perfil **normaliza** para o nome canônico do catálogo. O log mostra `CreditFlow iniciando. Perfil: api: Simulacao`, e o documento OpenAPI em `/openapi/v1.json` traz o perfil na descrição. É o tipo de detalhe que economiza tempo às 3h da manhã: o próprio processo diz o que ele é.
:::

::: quebra Lab: worker não serve HTTP de negócio
```bash
CREDITFLOW__MODULOS=Simulacao CREDITFLOW__PAPEL=worker dotnet run --project src/Host/CreditFlow.Host
curl -i localhost:8080/v1/simulacoes/taxas
curl -i localhost:8080/healthz/live
curl -i localhost:8080/scalar
```
:::

::: solucao
`/v1/simulacoes/taxas` e `/scalar` dão **404**: no papel `worker`, o `MapModulos` não mapeia nada de negócio e o OpenAPI não é publicado. `/healthz/live` responde 200, porque o Kubernetes precisa das sondas em qualquer papel. Um worker que respondesse HTTP de negócio poderia receber tráfego por engano (um `Service` mal configurado) e competir por CPU com o consumo do Kafka.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que o catálogo de módulos é uma lista explícita no `Program.cs`?
???
Assembly não referenciado pode não estar carregado na varredura; trimming/AOT removem o que ninguém referencia; e uma lista explícita deixa claro, num lugar só, o que o sistema tem.
:::

::: pergunta
O que acontece num pod com `CREDITFLOW__MODULOS=Simulacao` quando o caso de uso pede `IConsultaDeClientes`?
???
Clientes não está no perfil, mas implementa `IModuloComContratos`, então o Host chamou `RegistrarContratos`: a interface está registrada com o repositório de leitura, sem endpoints nem jobs de Clientes.
:::

**Próxima:** [1.3 BuildingBlocks](03-building-blocks.md).
