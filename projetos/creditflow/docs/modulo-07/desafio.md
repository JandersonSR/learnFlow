# Desafio do módulo 7: o perfil `worker-notificacoes`

Hoje o módulo Notificações roda dentro do **api-geral**: os consumidores de eventos dele disputam CPU e memória com as requisições HTTP de Clientes e Propostas. O time quer separar o consumo de Notificações num perfil próprio, sem criar imagem nova, e sem que o api-geral deixe de servir os endpoints de Notificações.

::: desafio O pedido
Crie o perfil `worker-notificacoes` (papel `worker`, módulo `Notificacoes`) e ajuste o que for preciso para que, no kind:

1. o api-geral **não** consuma mais eventos de Notificações (mas continue respondendo às rotas HTTP do módulo, se houver);
2. o worker-notificacoes consuma os três tópicos e escale por lag com KEDA;
3. ele tenha um `KafkaUser` próprio com a ACL mínima, e o api-geral perca a permissão de leitura que não usa mais;
4. as sondas, os recursos e o `terminationGracePeriodSeconds` sejam escolhidos e **justificados** num comentário no values.

Você vai precisar decidir onde fica a fronteira entre "o módulo está no processo" e "o consumidor do módulo está no processo". Leia como o `PerfilDeExecucao` e a Mensageria decidem quem registra consumidores antes de começar.
:::

## Critérios de aceite

- [ ] `helm template` com os valores padrão e com `values-local.yaml` gera 5 Deployments e nenhum erro de schema.
- [ ] `kubectl -n creditflow-dados exec <broker> -- kafka-consumer-groups.sh --describe --group creditflow-notificacoes` mostra **só** pods do worker-notificacoes como membros.
- [ ] Parar o worker-notificacoes (`kubectl scale --replicas=0`, ou `minimo: 0` no KEDA) não afeta nenhuma resposta HTTP do api-geral, e o lag acumulado é drenado quando ele volta.
- [ ] O `KafkaUser` do api-geral não tem mais `Read` nos tópicos que só Notificações lia (prove com `kubectl get kafkauser creditflow-geral -o yaml`).
- [ ] O `maximo` do KEDA respeita o número de partições, com o cálculo num comentário.
- [ ] Um parágrafo no ADR 0002 explicando quando separar um consumidor num perfil vale o custo (mais um Deployment, mais um usuário, mais um alerta).

::: dica Dica 1 (abra só se travar mais de 30 minutos)
O papel `worker` desliga o mapeamento de endpoints HTTP dos módulos, e o papel `api` liga. Se o api-geral precisa continuar com os endpoints mas sem os consumidores, você precisa de um interruptor que não existe hoje. Pense numa configuração por módulo (`Mensageria:Consumidores:<grupo>:Habilitado`?) em vez de um papel novo, e veja se a Mensageria já lê algo assim.
:::

::: dica Dica 2
Um grupo de consumidores consumindo três tópicos divide **todas** as partições dos três entre os membros. Com 6 partições por tópico são 18 partições: o limite útil de réplicas muda.
:::

::: solucao Uma solução possível (abra depois de tentar)
- Values: perfil `worker-notificacoes` com `papel: worker`, `modulos: [Notificacoes]`, `segredos: [mongo, kafka-notificacoes]`, `servico: false`, `autoescala: { tipo: keda, minimo: 0, maximo: 18, kafka: { grupo: creditflow-notificacoes, topico: ... } }`. O KEDA aceita `topic` vazio para olhar todos os tópicos do grupo; com um tópico só ele mediria só aquele.
- No api-geral: `env: { Mensageria__Consumidores__creditflow-notificacoes__Habilitado: "false" }` (e o código passa a respeitar a chave; é uma mudança pequena no registro de consumidores).
- `KafkaUser creditflow-notificacoes`: `Read`/`Describe` nos três tópicos, `Read` no grupo `creditflow-notificacoes`, `Write` na DLT `creditflow-notificacoes.dlt`. Remova os `Read` de `pagamentos.v1` e `simulacoes.v1` do `creditflow-geral` se Propostas não os usa (Propostas lê `pagamentos.v1` para a saga: esse fica).
- `minimo: 0` é aceitável aqui (notificação pode atrasar segundos); para Pagamentos, não.
- `terminationGracePeriodSeconds: 30`: enviar e-mail simulado é rápido; o que importa é terminar a mensagem atual e confirmar o offset.
:::
