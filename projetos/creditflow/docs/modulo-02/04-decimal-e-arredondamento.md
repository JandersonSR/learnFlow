# 2.4 `decimal`, arredondamento e o centavo que some

Em JavaScript, `0.1 + 0.2` é `0.30000000000000004`. Em C#, com `double`, também. Em sistemas de dinheiro, esse lixo da décima sétima casa vira centavo sumindo numa conciliação no fim do mês.

## Por que `double` erra

`double` é ponto flutuante **binário** (IEEE 754): guarda números como `mantissa × 2^expoente`. 0,1 em binário é uma dízima periódica (0,000110011001100...), igual a 1/3 em decimal. Ele guarda a aproximação mais próxima, e as aproximações somadas não fecham.

`decimal` é ponto flutuante **decimal**: `inteiro de 96 bits × 10^−escala`, com escala de 0 a 28. 0,1 é exatamente `1 × 10^−1`. Soma, subtração e multiplicação de valores com poucas casas são **exatas**.

| | `double` | `decimal` |
|---|---|---|
| Base | 2 | 10 |
| Dígitos significativos | ~15–17 | 28–29 |
| `0.1 + 0.2 == 0.3` | `false` | `true` |
| Velocidade | instrução de hardware | software, ~10–20× mais lento |
| Uso | física, gráficos, estatística | **dinheiro** |

::: porque E o custo de desempenho?
O motor faz algumas centenas de operações por simulação. Mesmo 20× mais lento que `double`, são microssegundos. O risco do `double` (um centavo errado num contrato) é jurídico; o custo do `decimal` é irrelevante. Em Node, a equivalência seria usar uma biblioteca como `decimal.js` ou trabalhar em centavos inteiros.
:::

::: armadilha `decimal` também arredonda
`1m / 3m` é `0,3333333333333333333333333333` (28 casas), não um terço. Divisão e potência com expoente grande perdem as últimas casas. Por isso o motor arredonda **em pontos escolhidos** e nunca compara resultados de divisão com `==` sem arredondar antes.
:::

## Onde arredondar

O CreditFlow segue três regras ([`TabelaDeAmortizacao`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Domain/Calculo/TabelaDeAmortizacao.cs)):

1. **O que é cobrado é em centavos.** Parcela, juros, amortização e saldo de cada linha da tabela são valores que vão para um boleto: têm exatamente 2 casas.
2. **O que é intermediário fica com todas as casas.** O PMT bruto (945,5960...), a soma do IOF diário, a TIR.
3. **Taxas são arredondadas só na apresentação.** O `CetMensal` guardado tem todas as casas; o JSON mostra `2.3395` (4 casas) via `PontosArredondados(4)`.

::: conceito Arredondamento bancário
`MidpointRounding.ToEven`: quando o número está **exatamente no meio**, arredonda para o dígito **par**. 0,125 → 0,12; 0,135 → 0,14; 0,145 → 0,14. O "meio para cima" escolar (`AwayFromZero`) sempre empurra o meio para cima, e em milhões de lançamentos a soma fica sistematicamente maior. O bancário empurra metade para cima e metade para baixo: o erro se cancela na média. É o padrão do `decimal.Round` do .NET e do `round()` do Python 3.
:::

::: previsao
Se o `decimal.Round(x, 2)` usasse `AwayFromZero`, alguma linha da tabela Price de 10.000 a 2% mudaria?
???
**Só se algum valor intermediário terminasse exatamente em ...5 na terceira casa.** No exemplo, nenhum termina: os juros são `saldo × 0,02`, e um saldo com 2 casas vezes 0,02 tem no máximo 4 casas, que raramente caem no meio exato. Por isso o modo de arredondamento é perigoso de outro jeito: **os testes podem passar com o modo errado**. Os casos de teste do CreditFlow vêm de uma implementação de referência que usa `ROUND_HALF_EVEN` explicitamente (lição 2.6), e em sistemas reais vale ter um caso construído para cair no meio exato.
:::

## O ajuste na última parcela

Arredondar a parcela da Price para cima (945,5960 → 945,60) faz cada parcela amortizar uma fração de centavo a mais. Sem ajuste, depois de 12 parcelas iguais o saldo ficaria em **−0,05**: o cliente teria pago 5 centavos a mais do que devia.

Três jeitos de resolver:

| Opção | Problema |
|---|---|
| Não arredondar a parcela | Ninguém paga 945,5960 |
| Distribuir a diferença entre as parcelas | Parcelas deixam de ser iguais, e o cliente pergunta por quê |
| **Ajustar a última** (escolhida) | A última difere em centavos; prática comum de mercado |

O código faz a última amortizar **exatamente o saldo restante**. Os testes garantem as consequências, para qualquer valor, prazo e sistema:

```csharp
Assert.Equal(principal, r.Parcelas.Sum(p => p.Amortizacao.Valor));   // soma das amortizações = principal
Assert.Equal(0m, r.Parcelas[^1].SaldoDevedor.Valor);                    // saldo final zero
Assert.All(r.Parcelas, p => Assert.Equal(p.Valor.Valor, p.Juros.Valor + p.Amortizacao.Valor));
```

::: porque Por que testar propriedades e não só exemplos
Os exemplos (R$ 10.000, 12x, 2%) provam que **aquele** caso está certo. As propriedades provam que, para **qualquer** entrada, nenhuma regra é violada: nenhum centavo aparece ou some. Valores esquisitos como 33.333,33 em 7 meses estão nos casos de propósito: são eles que fazem a divisão não fechar.
:::

::: quebra Lab: tire o ajuste
Em `TabelaDeAmortizacao.Gerar`, troque `ultima ? saldo : ...` para sempre usar a regra normal (`parcelaPrice - juros`). Rode `dotnet test tests/CreditFlow.Modules.Simulacao.Tests`. Quais testes falham, e com que diferença?
:::

::: solucao
Falham os testes de propriedade (`Amortizacoes_somam_o_principal_ao_centavo...`) para a Price, com diferenças de alguns centavos (saldo final negativo, soma de amortizações maior que o principal), e os de referência que conferem a última parcela e o total pago. Para a SAC, a amortização de 833,33 × 12 = 9.999,96: sobram 4 centavos de dívida. É exatamente o tipo de bug que passa em revisão de código ("a fórmula está certa!") e aparece na conciliação.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que `decimal` e não `double` para dinheiro?
???
`decimal` é base 10: valores com centavos são representados exatamente e somas fecham. `double` é base 2 e não representa 0,1 exatamente; os erros acumulam. O custo de desempenho do `decimal` é irrelevante perto do risco.
:::

::: pergunta
O que é arredondamento bancário e por que usá-lo?
???
Meio exato vai para o dígito par. Em grandes volumes, o erro se cancela; o "meio para cima" puxa a soma sempre para o mesmo lado.
:::

**Próxima:** [2.5 Value objects, o agregado e o caso de uso](05-modelo-e-caso-de-uso.md).
