# 2.1 Juros compostos e o vocabulário do crédito

Antes de qualquer código, a conta. Se você não consegue explicar a conta para o PO, não consegue revisar o código que a implementa.

## Juros simples × compostos

Você deve R$ 10.000 a 2% ao mês e não paga nada por três meses.

| Mês | Juros simples (sobre o principal) | Saldo | Juros compostos (sobre o saldo) | Saldo |
|---|---|---|---|---|
| 1 | 200,00 | 10.200,00 | 200,00 | 10.200,00 |
| 2 | 200,00 | 10.400,00 | 204,00 | 10.404,00 |
| 3 | 200,00 | 10.600,00 | 208,08 | 10.612,08 |

::: conceito Juros compostos
O juro de cada mês é calculado sobre o **saldo** do mês anterior, que já inclui os juros anteriores ("juros sobre juros"). Depois de *n* meses sem pagar, o saldo é `P × (1 + i)^n`. Crédito no Brasil é praticamente todo em juros compostos.
:::

## Mensal × anual: não é vezes 12

Se 2% ao mês fosse 24% ao ano, os R$ 10.000 virariam 12.400 em um ano. Com juros compostos, viram `10.000 × 1,02^12 = 12.682,42`. A taxa anual **equivalente** é:

```
anual = (1 + mensal)^12 − 1 = 1,02^12 − 1 = 26,82%
```

::: previsao
Uma propaganda diz "apenas 4,49% ao mês". Quanto é isso ao ano?
???
`1,0449^12 − 1 ≈ 69,4%` ao ano, e não 53,88% (4,49 × 12). A diferença entre "vezes 12" e o composto cresce com a taxa. É por isso que o CET do CreditFlow é informado nas duas bases, e a anual é sempre calculada pela potência ([`CalculadoraDeCet.Anualizar`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Domain/Calculo/CalculadoraDeCet.cs)). Um teste garante: `Anualizar(0,02)` é 0,2682..., e não 0,24.
:::

## Parcela = juros + amortização

Num empréstimo pago em parcelas, cada parcela tem duas partes:

```
juros do mês   = saldo devedor × taxa
amortização    = parcela − juros          (a parte que reduz a dívida)
novo saldo     = saldo − amortização
```

Tudo o que muda entre Price e SAC (próxima lição) é **como se escolhe a parcela**. A mecânica do mês é sempre esta.

## As regras do produto CreditFlow

| Regra | Valor | Onde mora |
|---|---|---|
| Valor | R$ 1.000 a R$ 50.000 | `ValorDoEmprestimo` |
| Prazo | 6 a 48 meses | `PrazoEmMeses` |
| Taxa | por faixa de score: A (≥800) 1,49%; B (≥650) 2,19%; C (≥500) 3,29%; D (resto ou sem score) 4,49% a.m. | configuração (`Simulacao:Faixas`) |
| Sistema | Price ou SAC | `SistemaDeAmortizacao` |
| Primeira parcela | um mês depois da contratação | motor |
| IOF | 0,0082% ao dia (até 365 dias) + 0,38% | `RegrasDeIof.PessoaFisica` |
| Validade da simulação | 7 dias | `SimulacaoDeEmprestimo.Validade` |

::: porque Por que a taxa depende do score
Juros são o preço do dinheiro **mais o preço do risco**. Uma parte dos clientes não vai pagar; a financeira embute essa perda esperada na taxa. Score alto, perda esperada menor, taxa menor. Por isso um cliente que revogou o consentimento para análise de crédito simula na faixa D: sem poder usar o score, a financeira assume o risco máximo (lição 2.5).
:::

## Perguntas para responder sem olhar

::: pergunta
Por que 2% ao mês não é 24% ao ano?
???
Porque os juros são compostos: cada mês incide sobre o saldo que já tem os juros anteriores. A anual equivalente é `1,02^12 − 1 ≈ 26,82%`.
:::

::: pergunta
O que é amortização?
???
A parte da parcela que reduz a dívida. O restante da parcela é juro do mês.
:::

**Próxima:** [2.2 Price × SAC](02-price-e-sac.md).
