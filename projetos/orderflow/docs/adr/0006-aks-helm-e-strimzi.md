# 0006. AKS com Helm, e Kafka dentro do cluster via Strimzi

- **Status:** Aceito
- **Data:** 2026-10-30
- **Decisores:** Janderson, revisão do time

## Contexto

Os dois serviços precisam de uma plataforma com deploy declarativo, probes, escala horizontal e
identidade gerenciada para acessar segredos sem senha. A empresa-alvo do portfólio usa Azure. O
Kafka precisa existir em dev (na máquina e num cluster de estudo) e em produção, com custo
controlado num projeto de estudo.

## Decisão

- **AKS** como plataforma, com Workload Identity para acessar Key Vault e ACR sem segredos, e
  infraestrutura como código (Bicep e Terraform, Módulo 6).
- **Helm**, um chart por serviço (`deploy/helm/orders`, `deploy/helm/payments`), com um arquivo de
  values por ambiente.
- **Kafka no próprio cluster com o operador Strimzi** (modo KRaft, sem ZooKeeper), declarado em CRDs
  (`Kafka`, `KafkaNodePool`, `KafkaTopic`, `KafkaUser`) versionados no repositório.

## Alternativas consideradas

- **Azure Container Apps.** Muito menos operação (sem nós, sem upgrades de cluster), KEDA e Dapr
  integrados. Rejeitado pelo objetivo de aprendizado (CKAD, AZ-104) e porque esconde exatamente o que
  o Módulo 7 ensina (rolling update, PDB, preStop). Para um time pequeno em produção real, é a
  primeira opção a avaliar.
- **Azure Event Hubs (camada Standard/Premium) com a API Kafka.** Kafka gerenciado, sem broker
  para operar, pago por unidade de capacidade. Rejeitado para o estudo: não é Kafka (sem Kafka
  Streams completo, sem Schema Registry Confluent nativo, limites próprios de partições e
  retenção), e o aprendizado do Strimzi transfere para qualquer nuvem.
- **Confluent Cloud.** O Kafka mais completo como serviço, com Schema Registry e conectores
  gerenciados. Rejeitado pelo custo num projeto de estudo; é o caminho natural se o Kafka virar
  peça crítica de produção sem um time de plataforma.
- **Kustomize em vez de Helm.** Mais simples para overlays. Helm escolhido pelo histórico de
  releases e rollback (`helm rollback`), usados no pipeline (ADR 0008).

## Consequências

- Positivas: um ambiente de estudo próximo ao de produção, portável (o Strimzi roda igual em kind,
  AKS, EKS); Kafka declarado como código e revisado em PR.
- Negativas: **operamos o Kafka**: upgrades do operador e do broker, discos, rebalanceamento de
  partições e o plantão disso. O cluster precisa de nós com folga para os brokers (custo fixo mesmo
  sem tráfego). Upgrades do AKS exigem PDBs corretos em todos os serviços (lição 7.7).
- Obrigatório: brokers com PDB e anti-afinidade por zona; monitoramento de disco e de lag
  (Kafka Exporter ligado) desde o primeiro dia.

## Revisitar quando

- O Kafka virar dependência crítica de produção sem um time que saiba operá-lo (migrar para
  Confluent Cloud ou Event Hubs Premium); ou
- o custo fixo dos nós de broker for maior que o de um serviço gerenciado equivalente no volume real.
