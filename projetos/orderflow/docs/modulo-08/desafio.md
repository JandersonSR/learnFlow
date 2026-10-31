# Módulo 8: Desafio sem roteiro

::: desafio Propor, revisar e defender a primeira mudança de 100×
A lição 8.2 concluiu que a primeira mudança de arquitetura do OrderFlow em escala é tirar a
chamada ao adquirente de dentro do consumidor Kafka. Você vai conduzir essa mudança como um
tech lead conduziria, **sem implementá-la**: a entrega é a decisão, não o código.

1. Escreva o **ADR 0009** como `Proposto`, num PR, seguindo o modelo de `docs/adr/README.md`.
2. Conduza uma **revisão de design** com pelo menos duas pessoas (colegas, ou um modelo de IA
   instruído a fazer as perguntas da lição 8.4 e a discordar de você). Registre as perguntas e
   como cada uma mudou o ADR.
3. Grave uma **apresentação de 10 minutos** da mudança para o time (lição 8.5) e uma **resposta de
   5 minutos** para "conte uma decisão de arquitetura difícil" usando este ADR (lição 8.6).
:::

## Critérios de aceite

- [ ] O contexto do ADR 0009 traz a conta: vazão máxima atual por partição, a carga de pico em 10×
      Black Friday e em 100×, e a concorrência necessária pela lei de Little, com as hipóteses explícitas.
- [ ] Pelo menos **três** alternativas reais, incluindo "mais partições" e "paralelismo por chave
      dentro da partição", cada uma com o motivo concreto de rejeição ou de adiamento.
- [ ] As consequências dizem o que acontece com: a ordem dos eventos por pedido, a idempotência
      com o adquirente (ADR 0004), o modelo de estados do `Payment` e o painel e os alertas do Módulo 7.
- [ ] O plano de entrega tem passos implantáveis separadamente, cada um compatível com a versão
      anterior (nenhum passo exige implantar os dois serviços juntos).
- [ ] O "Revisitar quando" tem um gatilho **observável no painel do OrderFlow** (cite a métrica).
- [ ] O registro da revisão mostra pelo menos uma mudança no ADR causada por uma pergunta, e pelo
      menos uma pergunta que você decidiu **não** acatar, com o porquê.
- [ ] Os ADRs que este afeta (0003? 0004? 0006?) estão citados; nenhum ADR aceito foi editado.
- [ ] A gravação de 5 minutos tem: contexto, problema, alternativas, decisão, um risco que você
      aceitou, e o que mudaria sua ideia. Cronometrada.

::: dica
Antes de escrever, refaça a tabela de carga da lição 8.2 com os seus números (o pico do seu
e-commerce imaginário pode ser outro). Um ADR forte usa as próprias hipóteses e diz quais são.
E repare que o Java 25 com threads virtuais muda o custo de uma das alternativas: 345 chamadas
simultâneas bloqueantes deixam de ser um problema de threads e passam a ser um problema do adquirente.
:::
