# Desafio do módulo 2: carência

::: desafio O problema
O comercial quer oferecer **carência**: o cliente contrata hoje e só começa a pagar depois de 1, 2 ou 3 meses. Durante a carência, os juros **não são pagos**: eles se somam ao saldo (são *capitalizados*), mês a mês, arredondados para centavos.

Regras:

1. `carenciaMeses` é opcional no `POST /v1/simulacoes` (padrão 0), de 0 a 3. Fora disso, erro de validação no campo `carenciaMeses`.
2. Saldo no fim da carência: `saldo = arredonda(saldo × (1 + i))`, repetido `carenciaMeses` vezes.
3. A tabela (Price ou SAC) é calculada sobre o **saldo capitalizado**, com o mesmo prazo, e a primeira parcela vence `carenciaMeses + 1` meses depois da contratação.
4. IOF: o diário é calculado sobre a amortização de cada parcela, com os dias contados **da contratação** (limite de 365); o adicional, sobre o principal original. (É uma simplificação: discuta no ADR como ficaria com o IOF só sobre o principal.)
5. CET: o fluxo do cliente tem **zeros** nos meses de carência. O valor presente começa a contar no mês 1, não no primeiro pagamento.
6. Carência 0 tem de produzir **exatamente** o resultado de hoje (todos os testes atuais passam sem mudança).
:::

## Critérios de aceite

Para R$ 10.000, 12 parcelas, 2% a.m., contratação em 15/01/2026, **carência de 2 meses** (valores da implementação de referência em Python, mesmo arredondamento do motor):

| | Price | SAC |
|---|---:|---:|
| Saldo capitalizado | 10.404,00 | 10.404,00 |
| 1º vencimento | 15/04/2026 | 15/04/2026 |
| 1ª parcela | 983,80 | 1.075,08 |
| Última parcela | 983,77 | 884,34 |
| IOF diário | 218,96 | 213,50 |
| IOF adicional | 38,00 | 38,00 |
| Valor liberado | 9.743,04 | 9.748,50 |
| CET mensal | 0,0232253093 | 0,0232381601 |

- [ ] Os dois casos acima como testes, com CET a menos de `1e-9`
- [ ] Teste de propriedade: soma das amortizações = saldo capitalizado; saldo final zero
- [ ] Carência 0: todos os testes atuais passam sem mudança
- [ ] `carenciaMeses: 4` devolve 400 com o campo no `errors`
- [ ] O agregado continua imutável; `Reconstituir` recebe a carência
- [ ] Um parágrafo no ADR: por que o CET com carência ficou **menor** que sem carência neste exemplo, e por que isso não quer dizer que a carência é "mais barata"
- [ ] A implementação de referência em Python atualizada e os valores dos testes gerados por ela (não copie a tabela acima sem refazer)

::: dica Dica 1: onde mexer
`ParametrosDoCalculo` ganha `CarenciaMeses`. O `TabelaDeAmortizacao.Gerar` não precisa mudar: chame-o com o saldo capitalizado e com `dataContratacao.AddMonths(carencia)` como data base. O que muda é o `MotorDeCalculo` (capitalizar antes, montar o fluxo do CET depois).
:::

::: dica Dica 2: o CET com zeros
`CalculadoraDeCet.TaxaInterna` recebe a lista de parcelas e trata o índice como o mês. Passe `carencia` zeros na frente. A derivada continua certa sem mudar nada: o termo de um zero é zero.
:::

::: dica Dica 3: o CET menor
Olhe o IOF: os dias de cada parcela ficaram maiores, mas o limite de 365 segura as últimas. E olhe o fluxo: o cliente fica mais tempo com o dinheiro. Agora compare o **total pago** com e sem carência.
:::

::: solucao Um desenho possível
```csharp
public sealed record ParametrosDoCalculo(
    Dinheiro Principal, int PrazoMeses, Percentual TaxaMensal, SistemaDeAmortizacao Sistema,
    DateOnly DataContratacao, RegrasDeIof Iof, int CarenciaMeses = 0);

public static ResultadoDoCalculo Calcular(ParametrosDoCalculo p)
{
    var saldo = p.Principal.Valor;
    for (var m = 0; m < p.CarenciaMeses; m++)
        saldo = MatematicaDecimal.Centavos(saldo * (1m + p.TaxaMensal.Fracao));

    var parcelas = TabelaDeAmortizacao.Gerar(new Dinheiro(saldo), p.PrazoMeses, p.TaxaMensal, p.Sistema,
        p.DataContratacao.AddMonths(p.CarenciaMeses));
    var iof = CalculadoraDeIof.Calcular(p.Principal, parcelas, p.DataContratacao, p.Iof); // dias desde a contratação
    var liberado = p.Principal - iof.Total;

    decimal[] fluxo = [.. Enumerable.Repeat(0m, p.CarenciaMeses), .. parcelas.Select(x => x.Valor.Valor)];
    var (cet, _) = CalculadoraDeCet.TaxaInterna(liberado.Valor, fluxo, p.TaxaMensal.Fracao);
    // ... totais e Percentuais como antes; acrescente SaldoCapitalizado ao resultado
}
```

O `CalculadoraDeIof` não muda: ele já recebe o principal (para o adicional) separado das parcelas (para o diário).

**Por que o CET caiu:** o IOF diário por real emprestado ficou menor (as parcelas mais distantes batem no teto de 365 dias), e o IOF pesa menos quando diluído num fluxo mais longo. Mas o cliente paga **11.805,57** na Price com carência contra **11.347,15** sem: são 404 de juros capitalizados a mais (e os juros sobre eles). Mesma taxa, mais dinheiro por mais tempo. O CET mede o custo **por mês de uso do dinheiro**, não o total; é exatamente o tipo de coisa que precisa estar na tela para o cliente.
:::

**Depois:** [Perguntas de entrevista](perguntas-de-entrevista.md).
