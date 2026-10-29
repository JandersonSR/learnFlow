# 12.3 ADRs: as decisões que você defende

::: conceito ADR (*Architecture Decision Record*)
Um documento curto que registra **uma** decisão de arquitetura: o contexto, as opções consideradas, a escolha e as consequências. O valor não está na decisão em si; está em, daqui a um ano, alguém entender **por que** foi assim, e saber o que precisaria mudar para decidir diferente.
:::

O gabarito do projeto tem os seus ADRs em [`docs/decisoes.md`](https://github.com/JandersonSR/squad-dotnet-kubernetes/blob/main/docs/decisoes.md). Os comentários no código (`// ADR-006`, `// ADR-004`) apontam para eles. Ao longo do curso, você leu as consequências dessas decisões no código; agora escreve as suas.

## O modelo

```markdown
# ADR-NNN: <a decisão, como frase curta>

**Status:** proposto | aceito | substituído por ADR-MMM  ·  **Data:** <dia>

## Contexto
<O problema e as forças em jogo: requisitos, restrições, números (tráfego, tamanho do time, custo).
Escreva para alguém que não estava na conversa.>

## Opções consideradas
1. <Opção A>: a favor..., contra...
2. <Opção B>: a favor..., contra...
3. <Opção C, inclusive "não fazer nada">: a favor..., contra...

## Decisão
<A opção escolhida, em uma frase, e o motivo principal.>

## Consequências
- Positivas: ...
- Negativas e custos que aceitamos: ...
- O que nos faria rever esta decisão: <o sinal concreto>
```

::: porque "O que nos faria rever" é a linha mais importante
Toda decisão é boa para um contexto. Escrever o sinal que muda o contexto ("se um módulo precisar escalar 10 vezes mais que os outros", "se o Kafka passar a ter 3 times consumindo") transforma o ADR de uma opinião congelada num critério que qualquer pessoa pode aplicar depois. É também a diferença entre uma resposta de pleno e uma de staff em entrevista.
:::

## Os três ADRs do projeto final

Escreva os três. Cada um retoma decisões que você estudou de um ângulo, e agora precisa defender inteiro.

::: desafio ADR 1: a forma do próximo sistema
**Contexto real:** o próximo sistema da empresa onde você trabalha. Monolito modular ou microsserviços? Use o tamanho do time, o número de deploys por semana, quem opera, e as lições 1.1 e 1.6.

Esse é o entregável do módulo 1, agora com tudo o que você aprendeu de operação: o custo de operar Kafka, Kubernetes e N pipelines (módulos 5 a 11) entra nos números.
:::

::: desafio ADR 2: a debandada no CEP frio
**Contexto:** a lição 4.2 mostrou que o handler atual troca a proteção contra debandada pelo controle do dado vencido. Decida: manter como está, redesenhar com exceções na fábrica, ou outra saída. Com números: quantos CEPs frios chegam em rajada? O ViaCEP tem limite de uso? Quanto custa a complexidade a mais?

Não existe resposta certa; existe resposta bem justificada.
:::

::: desafio ADR 3: escolha um
Escolha uma das decisões abaixo, que o curso discutiu sem fechar, e decida para o seu contexto:

- **Cota esgotada: 422 ou 429?** (lição 1.7)
- **Harbor dentro do cluster da aplicação ou fora?** (lição 10.2)
- **Outbox para o `CotaEsgotada`: implementação própria ou biblioteca (MassTransit, Wolverine)?** (lição 5.2)
- **Kafka no AKS com Strimzi ou gerenciado (Confluent Cloud, Event Hubs)?** (lição 5.4)
- **Um repositório ou repositório GitOps separado?** (lição 11.2)
:::

## Como saber se o ADR está bom

| Critério | Pergunta para conferir |
|---|---|
| Contexto | Alguém de fora entende o problema sem ter estado na reunião? |
| Opções | Há pelo menos duas opções reais, e a recusada tem argumentos honestos a favor? |
| Números | Há pelo menos um número (tráfego, custo, tempo, tamanho do time)? |
| Custos | As consequências negativas estão escritas, não só as positivas? |
| Revisão | Existe um sinal concreto que faria a decisão mudar? |
| Tamanho | Cabe em uma página? |

::: armadilha
O ADR que só lista vantagens da opção escolhida não é um registro de decisão, é uma propaganda. Se você não consegue escrever um bom argumento a favor da opção que recusou, ainda não entendeu o trade-off. Volte à lição e tente defender o outro lado por cinco minutos.
:::

**Próxima:** [12.4 Apresentação, entrevista simulada e autoavaliação](04-apresentacao-e-autoavaliacao.md).
