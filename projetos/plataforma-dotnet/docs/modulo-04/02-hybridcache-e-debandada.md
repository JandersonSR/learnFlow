# 4.2 HybridCache por dentro e a debandada

## O que o HybridCache junta

No [`CepModulo.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/CepModulo.cs):

```csharp
services.AddHybridCache(o => o.DefaultEntryOptions = new HybridCacheEntryOptions
{
    Expiration = TimeSpan.FromMinutes(minutos),                     // L2: 60 min
    LocalCacheExpiration = TimeSpan.FromMinutes(Math.Min(minutos, 5)) // L1: 5 min
});
var dragonfly = configuracao.GetConnectionString("Cache");
if (!string.IsNullOrWhiteSpace(dragonfly))
    services.AddStackExchangeRedisCache(o =>
    {
        o.Configuration = dragonfly;
        o.InstanceName = "cep-api:";
    });
```

::: conceito HybridCache
Uma API de cache do .NET (desde o 9) que junta duas camadas atrás de uma interface só: a memória do processo (L1) e um cache distribuído (L2), que é qualquer `IDistributedCache` registrado. Aqui, o L2 é o Dragonfly, falando o protocolo do Redis pelo cliente `StackExchange.Redis`.
:::

::: porque Por que HybridCache e não `IDistributedCache` direto
Com `IDistributedCache` puro, você escreveria à mão: procurar na memória, procurar no Redis, serializar, gravar nos dois, controlar validades diferentes. O HybridCache faz isso, e ainda **junta chamadas simultâneas** para a mesma chave (proteção contra debandada, logo abaixo).

E repare no `if`: sem `ConnectionStrings:Cache`, só o L1 funciona. Os testes e quem roda sem Dragonfly continuam funcionando igual, só sem a camada compartilhada.
:::

::: checkpoint
Com o `docker compose up`, faça uma consulta e veja a chave no Dragonfly:

```bash
curl -s localhost:8080/v1/cep/01001000 > /dev/null
docker compose exec dragonfly redis-cli keys '*'      # cep-api:cep:01001000
docker compose exec dragonfly redis-cli ttl cep-api:cep:01001000
```

O prefixo `cep-api:` vem do `InstanceName`; o resto, da chave `cep:{cep}` do handler. O `ttl` mostra os segundos que faltam dos 60 minutos.
:::

::: porque Por que o prefixo `cep-api:`
O Dragonfly pode ser compartilhado por outras aplicações no futuro. Sem prefixo, duas aplicações com a chave `cep:01001000` e formatos diferentes de valor sobrescreveriam uma à outra. O prefixo é o "schema" do cache.
:::

## A debandada (*cache stampede*)

::: conceito Debandada
Uma chave popular vence (ou nunca esteve no cache) e, no mesmo instante, centenas de requisições pedem por ela. Todas veem "não tem no cache" e todas vão à origem ao mesmo tempo. A origem, que o cache deveria proteger, recebe o pico inteiro de uma vez.
:::

O `GetOrCreateAsync` do HybridCache protege disso **dentro de um processo**: se 200 requisições pedem a mesma chave ao mesmo tempo, a fábrica (a função que busca na origem) roda **uma vez**, e as outras 199 esperam e recebem o mesmo resultado.

```csharp
var endereco = await cache.GetOrCreateAsync(
    $"cep:{cep}",
    async ct => await BuscarNaOrigem(cep, ct));   // roda uma vez por chave, mesmo com 200 chamadas juntas
```

## O que o handler do projeto faz de diferente

Abra o [`ConsultarCepHandler.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/Features/ConsultarCep/ConsultarCepHandler.cs). Ele **não** passa a busca no banco e na fonte como fábrica. Ele usa o HybridCache só para **ler**:

```csharp
private static readonly HybridCacheEntryOptions SoLeitura = new()
{
    Flags = HybridCacheEntryFlags.DisableLocalCacheWrite | HybridCacheEntryFlags.DisableDistributedCacheWrite
};

var emMemoria = await memoria.GetOrCreateAsync(
    Chave(cep), static _ => ValueTask.FromResult<ConsultarCepResponse?>(null), SoLeitura, cancellationToken: ct);
if (emMemoria is not null)
    return Registrar(emMemoria, OrigemDoDado.Memoria);

// ... daqui para baixo: banco, fonte, e SetAsync na memória quando o dado é válido
```

::: porque Por que o autor escolheu assim
O fluxo tem uma regra que não cabe numa fábrica simples: **dado vencido do banco pode ser devolvido, mas não pode subir para a memória**. Uma fábrica do `GetOrCreateAsync` sempre tem seu resultado gravado no cache. Separando a leitura (com escrita desligada pelas *flags*) da gravação (`SetAsync`, só em `Encontrado` e só se não for `CacheVencido`), o handler controla exatamente o que sobe.
:::

::: previsao
Um CEP que nunca foi consultado vira notícia, e **200 requisições** chegam ao mesmo tempo, todas no mesmo pod. Com o handler como está, quantas vão ao **banco**? Quantas vão ao **ViaCEP**? O que aparece nos logs?
???
Potencialmente **as 200 vão ao banco e as 200 vão ao ViaCEP.**

O `GetOrCreateAsync` com a fábrica que devolve `null` junta as 200 chamadas... numa fábrica que não faz nada. Todas recebem `null` e seguem, cada uma, para `db.Enderecos.FindAsync`. Ninguém achou no banco, então todas chamam `fonte.ConsultarAsync`. Depois, todas tentam gravar o mesmo CEP: uma consegue, e 199 caem no `catch (DbUpdateException)` e registram **"CEP já gravado por outra réplica"** (mesmo sendo o mesmo pod). Esse log em rajada é o sintoma da debandada.

A proteção contra debandada do HybridCache existe, mas o desenho do handler a contorna para ganhar o controle sobre o dado vencido. É um trade-off, e é o tipo de coisa que só se vê lendo o código com atenção: o guia do nível 14 cita a proteção como motivo para usar o HybridCache, e no caminho do CEP frio ela não está agindo.
:::

::: armadilha
Mesmo com a fábrica protegida, a proteção do HybridCache vale **por processo**. Com 8 pods, uma chave fria pode gerar até 8 idas à origem, uma por pod. Para a maioria dos casos, 8 é aceitável (contra 200 por pod). Se não for, a saída é uma trava distribuída no próprio Dragonfly, com seus próprios problemas (o que acontece se o pod que pegou a trava morrer?).
:::

## Desafio: proteger o CEP frio sem perder a regra do vencido

::: desafio
Redesenhe o handler para que, num mesmo pod, uma rajada de requisições para um CEP frio gere **uma** ida ao banco e **uma** ida ao ViaCEP, mantendo as regras:

1. Dado vencido do banco é devolvido quando a fonte está fora, mas **não** sobe para a memória.
2. CEP inexistente não fica 60 minutos em cache (se o ViaCEP passar a conhecê-lo, a API deve descobrir logo).
3. Os cabeçalhos `X-Cache` e `X-Cache-Camada` continuam corretos.

Escreva primeiro, em português, como seria o fluxo. Depois o código. E por fim responda: **vale a pena?** Considere quantos CEPs frios chegam em rajada na vida real.
:::

::: dica Dica 1
Se a fábrica do `GetOrCreateAsync` **lança exceção**, nada é gravado no cache e todas as chamadas que estavam esperando recebem a exceção. Dá para usar isso para "não guardar este resultado".
:::

::: dica Dica 2
Para saber se o valor veio da memória ou da fábrica (por causa do `X-Cache-Camada`), a fábrica pode marcar um campo num objeto de estado passado pela sobrecarga `GetOrCreateAsync(chave, estado, fabrica, ...)`.
:::

::: solucao Um desenho possível
**O fluxo:**

1. `GetOrCreateAsync` com uma fábrica que faz banco → fonte.
2. Na fábrica: banco válido ou fonte respondeu → devolve o endereço (vai para a memória, como deve).
3. Fonte fora com registro vencido → **lança** `FonteIndisponivelException(vencido)`. Nada vai para a memória; todas as chamadas da rajada recebem a exceção e o handler a converte em resposta `STALE`.
4. CEP inexistente → também **lança** (`CepInexistenteException`), para não guardar a ausência por 60 minutos. (Alternativa: guardar a ausência com uma validade curta, de 1 minuto, para proteger a fonte de alguém consultando CEPs inventados em loop.)

**Esboço** (não compilado; a forma importa mais que os detalhes):

```csharp
private sealed class Busca(ConsultarCepHandler handler, string cep)
{
    public bool VeioDaOrigem;   // a fábrica rodou nesta chamada?
    public OrigemDoDado Origem;
    public async ValueTask<ConsultarCepResponse> BuscarAsync(CancellationToken ct)
    {
        VeioDaOrigem = true;
        var (resposta, origem) = await handler.BancoOuFonte(cep, ct); // lança nos casos 3 e 4
        Origem = origem;
        return resposta;
    }
}

var busca = new Busca(this, cep);
try
{
    var resposta = await memoria.GetOrCreateAsync(
        Chave(cep), busca, static (b, ct) => b.BuscarAsync(ct), cancellationToken: ct);
    return Registrar(resposta, busca.VeioDaOrigem ? busca.Origem : OrigemDoDado.Memoria);
}
catch (FonteIndisponivelException ex) when (ex.Vencido is not null)
{
    return Registrar(EnderecoMapper.ParaResposta(ex.Vencido), OrigemDoDado.CacheVencido);
}
catch (FonteIndisponivelException) { return CepErros.FonteIndisponivel; }
catch (CepInexistenteException) { return CepErros.NaoEncontrado; }
```

Repare que as chamadas que esperaram pela fábrica de **outra** chamada recebem o resultado com `VeioDaOrigem = false` no objeto delas, e seriam marcadas como `memoria`. É uma imprecisão pequena no cabeçalho, que você pode aceitar ou resolver.

**Vale a pena?** Depende de medir. Se os CEPs frios chegam espalhados (o normal), o desenho atual é mais simples e o custo é desprezível. Se a fonte externa tem limite de uso ou cobra por chamada, ou se há rajadas reais de CEP frio (uma campanha, um robô), a proteção paga a complexidade. Exceções para controle de fluxo também têm custo de leitura e de CPU. O que **não** é aceitável é escolher sem saber que o trade-off existe.
:::

## Vídeo

::: video Introducing HybridCache in ASP.NET Core (dotnet, em inglês)
https://www.youtube.com/watch?v=rjMfDUP4-eQ
O time do .NET apresentando o HybridCache: as duas camadas, a proteção contra debandada, tags e serialização.
:::

Documentação: [HybridCache no ASP.NET Core](https://learn.microsoft.com/aspnet/core/performance/caching/hybrid).

## Perguntas para responder sem olhar

::: pergunta
O que é a debandada (*cache stampede*) e como o `GetOrCreateAsync` protege dela?
???
Muitas requisições pedem ao mesmo tempo uma chave que não está no cache, e todas vão à origem. O `GetOrCreateAsync` executa a fábrica uma vez por chave dentro do processo, e as chamadas simultâneas esperam e recebem o mesmo resultado.
:::

::: pergunta
Por que o handler do projeto usa o HybridCache só para ler, com as escritas desligadas?
???
Para controlar o que sobe para a memória: dado vencido do banco pode ser devolvido, mas não pode ir para o cache. Uma fábrica simples teria o resultado sempre gravado. O custo desse desenho é perder a proteção contra debandada no caminho do CEP frio.
:::

::: pergunta
A proteção contra debandada do HybridCache vale entre pods?
???
Não, vale por processo. Com N pods, uma chave fria pode gerar até N idas à origem. Para evitar, seria preciso uma trava distribuída, com os problemas que ela traz.
:::

**Próxima:** [4.3 Quando o cache falha](03-quando-o-cache-falha.md).
