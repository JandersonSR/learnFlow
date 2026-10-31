# Desafio do módulo 5: cachear o perfil de crédito para a simulação, sem quebrar a LGPD

::: desafio Perfil de crédito na simulação identificada
Quando a simulação traz `clienteId`, o módulo Simulação consulta `IConsultaDeClientes.ObterPerfilDeCreditoAsync` (Postgres) para escolher a faixa. Num pico de campanha, isso é uma consulta ao banco por simulação, e o mesmo cliente simula 10, 20 vezes seguidas mexendo no valor e no prazo.

O time propõe cachear o perfil. Você decide **se** e **como**, sem roteiro.

**Restrições do negócio**

- A faixa usada na simulação pode estar desatualizada por no máximo **2 minutos**.
- Se o cliente **revogar o consentimento** de análise de crédito, a próxima simulação dele **não** pode usar o score (vale a faixa de maior risco), sem esperar validade nenhuma.
- Score e renda são dados pessoais: nada de perfil legível em chave ou valor do Dragonfly que sobreviva à exclusão do cliente.

**Critérios de aceite**

- [ ] Escrito antes do código (no ADR 0005 ou num ADR novo): cachear ou não, em qual camada, com qual validade, e o pior caso de desatualização calculado
- [ ] Teste de integração: revogar o consentimento e simular em seguida usa a faixa de maior risco
- [ ] Teste de integração: 20 simulações seguidas do mesmo cliente fazem no máximo 1 consulta ao perfil por réplica dentro da validade
- [ ] Com o Dragonfly fora, a simulação identificada continua respondendo
- [ ] O que exatamente fica no Dragonfly (chave e valor) está documentado, e não contém CPF, nome nem renda em claro
:::

::: dica Dica 1
Você não precisa cachear o **perfil**. A simulação só precisa da **faixa** (`"B"`). Cachear `cliente → faixa` guarda muito menos dado pessoal que `cliente → {score, renda}`.
:::

::: dica Dica 2
"Revogou, vale na hora" é invalidação **na escrita**: o caso de uso de revogar (módulo Clientes) precisa avisar. Pense em quem é dono do cache e em como o aviso chega sem o módulo Clientes conhecer o HybridCache da Simulação (evento? contrato?).
:::

::: solucao Um desenho possível
- **Cachear a faixa, não o perfil**: chave `simulacao:faixa-do-cliente:v1:{clienteId}`, valor `"B"` (ou `null` = sem consentimento). Só **L1** (memória, 2 min), **sem L2**: o ganho é evitar o banco em sequências do mesmo cliente na mesma réplica (o ingress com afinidade ajuda, mas não é necessário), e nada de pessoal vai para o Dragonfly. `HybridCacheEntryFlags.DisableDistributedCache` nas opções da entrada faz isso.
- **Revogação imediata**: o caso de uso `RevogarConsentimento` grava a revogação e um evento `ConsentimentoRevogado` (outbox). A Simulação consome e chama `RemoveAsync` da chave daquele cliente, e publica no canal pub/sub para as outras réplicas apagarem o L1. Se o aviso se perder, o pior caso são 2 minutos: **isso viola a restrição**. Então, para ser estrito, a simulação confere o consentimento na fonte quando o cache diz que há consentimento e a última revogação do cliente é recente; ou o negócio aceita os 2 minutos por escrito. A resposta honesta do desafio é mostrar esse conflito e escolher com o negócio.
- **Pior caso documentado**: com aviso: segundos. Sem aviso: 2 min (L1). Sem L2, não há soma de camadas.
- **Dragonfly fora**: não afeta, porque o L2 não é usado para esta chave.
:::
