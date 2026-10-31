# 2.6 Endpoint público, rate limit e testes: conferi a conta de dois jeitos

## Os endpoints

| Método | Rota | Auth | Resposta |
|---|---|---|---|
| `GET` | `/v1/simulacoes/taxas` | pública | faixas e taxas |
| `POST` | `/v1/simulacoes` | pública, com rate limit | 201 + `Location` + simulação; 400/404/429 |
| `GET` | `/v1/simulacoes/{id}` | pública | 200 / 404 |

```bash
curl -si -X POST localhost:8080/v1/simulacoes -H 'Content-Type: application/json' \
  -d '{"valor":10000.00,"prazoMeses":12,"sistema":"price"}'
```

```json
{
  "id": "0199f0c2-...", "valor": 10000.00, "prazoMeses": 12, "sistema": "price", "faixaDeScore": "D",
  "taxaMensalPercentual": 4.49, "iofDiario": 174.50, "iofAdicional": 38.00, "iofTotal": 212.50,
  "valorLiberado": 9787.50, "totalJuros": 3152.42, "totalPago": 13152.42,
  "cetMensalPercentual": 4.8674, "cetAnualPercentual": 76.88, "dataContratacao": "2026-01-15",
  "parcelas": [ { "numero": 1, "vencimento": "2026-02-15", "valor": 1096.03, ... } ]
}
```

(Sem `clienteId`, a faixa é D, 4,49% a.m. Os números acima são de uma contratação em 15/01/2026, conferidos com o script da seção "Conferi a conta de dois jeitos"; os seus mudam com a data de hoje, porque os dias do IOF mudam.)

::: porque Por que a resposta não tem o `clienteId`
O `GET /v1/simulacoes/{id}` é público: quem tem o id vê a simulação. O id é um Guid v7 (difícil de adivinhar), mas pode vazar num log, num link compartilhado. A simulação não precisa dizer **de quem** é para ser útil, então não diz. O `clienteId` existe no agregado e no contrato interno (`SimulacaoDto`), que só outros módulos leem.
:::

## Rate limit: público não é ilimitado

```csharp
services.AddRateLimiter(o => o.AddPolicy(SimulacaoEndpoints.PoliticaDeLimite, http =>
    RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: http.Connection.RemoteIpAddress?.ToString() ?? "desconhecido",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = porMinuto,          // Simulacao:RequisicoesPorMinuto (30; 120 no Development)
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        })));
```

E no Host, a resposta de recusa: **429** em ProblemDetails, com `Retry-After`.

::: conceito Partição
O limitador mantém um contador **por chave**: aqui, por IP. Cada IP tem a sua janela de 30 requisições por minuto. Sem partição (um limitador global), um único robô esgotaria o limite de todo mundo.
:::

| Algoritmo | Como funciona | Quando |
|---|---|---|
| Janela fixa (usado) | N requisições por janela; zera no fim | Simples, previsível. Permite rajada de 2N na virada da janela |
| Janela deslizante | Janela dividida em segmentos que vão expirando | Suaviza a virada |
| Token bucket | Fichas repostas a taxa constante; cada requisição gasta uma | Permite rajada curta e controla a média |
| Concorrência | N requisições **simultâneas** | Proteger um recurso lento |

::: armadilha Atrás do Ingress, todo mundo é o Ingress
No Kubernetes, `RemoteIpAddress` é o IP do pod do Ingress, não do cliente: todos os usuários caem na **mesma partição** e o limite vira global. A correção é processar o cabeçalho `X-Forwarded-For` que o Ingress envia, com `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` no deployment (módulo 7). E isso só é seguro porque o Ingress é a única entrada: se o pod fosse acessível direto, qualquer um forjaria o cabeçalho e escolheria a própria partição.
:::

::: porque Por que o rate limit é por pod (e o que isso significa)
O contador mora na memória de cada pod. Com 4 réplicas do api-simulacao, o limite efetivo por IP é até 4 × 30. Para um limite de proteção contra abuso, isso é aceitável. Se fosse um limite comercial ("plano grátis: 100 por dia"), precisaria de um contador compartilhado (no Dragonfly, por exemplo), com o custo de uma ida à rede por requisição.
:::

::: quebra Lab: estoure o limite
```bash
for i in $(seq 1 130); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/v1/simulacoes \
    -H 'Content-Type: application/json' -d '{"valor":5000,"prazoMeses":12,"sistema":"sac"}'
done | sort | uniq -c
curl -si -X POST localhost:8080/v1/simulacoes -H 'Content-Type: application/json' \
  -d '{"valor":5000,"prazoMeses":12,"sistema":"sac"}' | grep -i -E 'HTTP/|retry-after'
```
Preveja: quantos 201 e quantos 429? (Lembre o valor do `appsettings.Development.json`.) O `GET /v1/simulacoes/taxas` também está limitado?
:::

::: solucao
**120 × 201 e 10 × 429** (se a janela não virar no meio do laço), e a última resposta traz `Retry-After` com os segundos que faltam para a janela fechar. O `GET /taxas` **também** está limitado e conta na mesma partição: a política foi aplicada no **grupo**. Se você quisesse limitar só o `POST`, moveria o `RequireRateLimiting` para ele. Qual faz mais sentido? Um robô listando taxas em loop é barato de atender; o `POST` é o caro (CPU do motor e gravação).
:::

## Conferi a conta de dois jeitos

Um teste que compara o C# com valores **calculados pelo próprio C#** não prova nada: se a fórmula estiver errada, o teste confirma o erro. Os valores esperados do [`MotorDeCalculoTests`](https://github.com/JandersonSR/lending-plataform/blob/main/tests/CreditFlow.Modules.Simulacao.Tests/MotorDeCalculoTests.cs) vieram de outro lugar: o **mesmo algoritmo, escrito de novo em Python**, com `Decimal` de 28 dígitos (como o `decimal` do .NET) e `ROUND_HALF_EVEN` explícito.

```python
from decimal import Decimal as D, getcontext, ROUND_HALF_EVEN
import calendar
getcontext().prec = 28
def r2(x): return x.quantize(D("0.01"), rounding=ROUND_HALF_EVEN)

def add_months(d, k):   # igual ao DateOnly.AddMonths: limita o dia ao fim do mês
    m = d.month - 1 + k; y = d.year + m // 12; m = m % 12 + 1
    return d.replace(year=y, month=m, day=min(d.day, calendar.monthrange(y, m)[1]))

def tabela(P, n, i, sistema, d0):
    saldo, linhas = P, []
    if sistema == "price":
        f = (1 + i) ** n
        parcela = r2(P / n) if i == 0 else r2(P * i * f / (f - 1))
    else:
        amort_base = r2(P / n)
    for k in range(1, n + 1):
        juros = r2(saldo * i)
        amort = saldo if k == n else (parcela - juros if sistema == "price" else amort_base)
        saldo -= amort
        linhas.append(dict(venc=add_months(d0, k), valor=amort + juros, juros=juros, amort=amort, saldo=saldo))
    return linhas

def iof(P, linhas, d0):
    diario = sum(l["amort"] * D("0.000082") * min((l["venc"] - d0).days, 365) for l in linhas)
    return r2(diario), r2(P * D("0.0038"))

def tir(liberado, valores, r):
    for it in range(100):
        v = 1 / (1 + r); vk = D(1); f = -liberado; df = D(0)
        for k, p in enumerate(valores, 1):
            vk *= v; f += p * vk; df -= k * p * vk * v
        prox = r - f / df
        if abs(prox - r) < D("1e-12"): return prox
        r = prox
```

E o CET foi conferido por um **terceiro** método, que não compartilha nada com o Newton-Raphson: **bisseção** em ponto flutuante (procura a raiz cortando o intervalo [0, 1] ao meio 200 vezes):

```python
def bissecao(liberado, valores):
    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = (lo + hi) / 2
        vp = sum(v / (1 + mid) ** k for k, v in enumerate(valores, 1))
        lo, hi = (mid, hi) if vp > liberado else (lo, mid)
    return (lo + hi) / 2
```

| Caso | Parcela 1 | Última | IOF | Liberado | CET mensal (Newton, Decimal) | CET (bisseção, float) |
|---|---:|---:|---:|---:|---|---|
| Price 10.000 / 12 / 2% | 945,60 | 945,55 | 205,37 | 9.794,63 | 0,0233952169 | 0,0233952169 |
| SAC 10.000 / 12 / 2% | 1.033,33 | 850,04 | 199,47 | 9.800,53 | 0,0234109302 | 0,0234109302 |
| Price 50.000 / 48 / 1,49% | 1.465,62 | 1.465,37 | 1.561,18 | 48.438,82 | 0,0163951934 | 0,0163951934 |
| SAC 1.000 / 6 / 4,49% | 211,57 | 174,13 | 12,44 | 987,56 | 0,0489277822 | 0,0489277822 |
| Price 7.000 / 24 / 3,29% | 426,35 | 426,38 | 199,84 | 6.800,16 | 0,0356476890 | 0,0356476890 |

::: porque Por que isso vale mais que "conferi na planilha"
Três implementações, duas linguagens, dois algoritmos de raiz, duas aritméticas (decimal e binária). Para os três concordarem até a décima casa com um erro de fórmula, o erro teria de estar nos três do mesmo jeito. Ainda é possível (se a **regra** estiver errada, as três implementam a regra errada), e por isso o teste da Price de 10.000 também confere a tabela inteira contra o valor de livro: PMT de 945,60 é o resultado clássico para 10.000 a 2% em 12 meses.
:::

::: armadilha O que a comparação NÃO prova
Que o C# arredonda igual ao Python em **todos** os casos. As duas aritméticas têm 28 dígitos, mas não são idênticas na última casa de uma divisão. Por isso o CET é comparado com tolerância (`1e-9`) e os valores em centavos com igualdade exata: um centavo de diferença é bug; a 15ª casa de uma taxa, não.
:::

## O resto dos testes

| Arquivo | Cobre |
|---|---|
| `MotorDeCalculoTests` | referência (7 casos), tabela completa, propriedades (soma das amortizações, saldo zero, centavos), Price constante, SAC decrescente, SAC com menos juros, sem IOF ≈ taxa, taxa zero, limite de 365 dias, convergência, anualização composta, potência |
| `ValoresDaSimulacaoTests` | limites de valor e prazo, fração de centavo recusada, faixas com mínimo inclusivo, erro com os dois campos, validade de 7 dias |
| `SimularEmprestimoTests` | anônimo na faixa D, data em Brasília, score com consentimento, sem consentimento vira anônimo, cliente inexistente não grava nem publica, sistema inválido, maiúsculas e espaços, repositório com limite |

```bash
dotnet test tests/CreditFlow.Modules.Simulacao.Tests
```

::: dica Fakes à mão, sem biblioteca de mock
Os testes usam classes pequenas (`RelogioFixo`, `ClientesFalsos`, `PublicadorEspiao`, `TabelaFixa`) em vez de Moq ou NSubstitute. Com portas pequenas, um fake tem três linhas e lê como o comportamento esperado; um mock com `Setup(...).Returns(...)` para cada teste esconde a intenção. O `RelogioFixo` herda de `TimeProvider` (do próprio .NET 8+), que é a abstração de relógio que o caso de uso recebe.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que os valores esperados dos testes do motor vieram de uma implementação em Python?
???
Porque testar o código contra valores gerados por ele mesmo só confirma o que ele já faz, inclusive os erros. Uma implementação independente, numa linguagem diferente, e um terceiro método para a TIR, reduzem a chance de o mesmo erro estar nos dois lados.
:::

::: pergunta
O rate limit é de 30 por minuto por IP. Com 5 réplicas e o Ingress na frente, sem `X-Forwarded-For` processado, qual o limite real?
???
Todos os clientes aparecem com o IP do Ingress: uma partição só por pod. O limite vira 30 por minuto **para todo mundo junto**, por pod, ou seja, até 150 no total. Com o cabeçalho processado, volta a ser 30 por IP por pod.
:::

**Próximo:** [Desafio: carência](desafio.md).
