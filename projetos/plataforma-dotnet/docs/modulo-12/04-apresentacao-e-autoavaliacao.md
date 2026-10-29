# 12.4 Apresentação, entrevista simulada e autoavaliação

A última parte fecha o ciclo do jeito que o curso abriu: ensinar é o teste mais honesto de que você aprendeu.

## A apresentação ao time

**Formato:** 30 minutos de apresentação e 15 de perguntas, para o time (ou para um grupo de devs).

**Roteiro sugerido:**

1. **O sistema em 3 minutos:** os dois diagramas do módulo 0, explicados com as suas palavras.
2. **O game day em 10 minutos:** o sintoma, como você investigou, a causa, o que o desenho fez certo, o que mudou depois (o post-mortem).
3. **Uma decisão em 10 minutos:** um dos seus ADRs, com as opções e o que faria você mudar de ideia.
4. **Uma demonstração ao vivo em 5 minutos:** um dos labs que mais te ensinou (o rolling update sem perder requisição, a mensagem envenenada, o `git revert` com o Argo CD).
5. **O que eu ainda não sei:** 2 minutos. Dizer o que você não domina é sinal de senioridade, não de fraqueza.

::: porque Por que apresentar
Explicar para outras pessoas obriga a organizar o que você sabe. E as perguntas do time vão achar as lacunas que nenhuma autoavaliação acha. Anote cada pergunta que você não conseguiu responder bem: essa é a lista do que estudar a seguir.
:::

## A entrevista simulada

Peça para alguém (um colega sênior, um amigo da área, ou o próprio Claude no papel de entrevistador) fazer uma entrevista de 45 minutos com as perguntas abaixo, sorteando uma de cada bloco. Grave, se puder, e assista depois.

| Bloco | Perguntas |
|---|---|
| Arquitetura | Monolito modular ou microsserviços para um time de 8? · Como garantir que módulos não se acoplem? · Quando usar DDD tático? |
| Dados | Como renomear uma coluna sem downtime? · Duas réplicas atualizam o mesmo contador: como não perder atualizações? · O banco recusou conexões no pico: por quê? |
| Mensageria | Kafka ou RabbitMQ? · Como publicar um evento depois de gravar sem perder nada? · Uma mensagem está travando o consumidor: o que você faz? |
| Plataforma | Liveness, readiness e startup: diferenças e o que acontece se errar · Como evitar erros num rolling update? · Como a aplicação lê segredos sem senha? |
| Entrega | Como o pipeline se autentica na nuvem? · Como garantir que imagem vulnerável não chega a produção? · O que é GitOps e como você faz rollback? |
| Comportamental | Conte um incidente que você resolveu (use o game day e o post-mortem) · Conte uma decisão técnica que você tomou e o que faria diferente (use um ADR) |

As respostas de referência estão nas páginas de perguntas de entrevista de cada módulo. Mas, na simulação, **não leia**: a ideia é ouvir como você responde sem apoio.

::: checkpoint O critério de uma boa resposta
Para cada resposta gravada, confira:

- Começou pela **decisão** ou pela resposta direta, e não por um rodeio?
- Deu o **motivo** com um exemplo concreto (do projeto, de um lab, do trabalho)?
- Disse o **custo** ou a alternativa recusada?
- Coube em **dois minutos**?
:::

## A autoavaliação

Volte à tabela da [seção 4 do módulo 0](../00-visao-geral.md) e preencha a coluna "Nota no fim", com a mesma escala:

- **0:** só conheço o nome
- **1:** sigo um tutorial e funciona
- **2:** consigo explicar por que cada coisa está ali e resolver o erro comum
- **3:** consigo escolher entre alternativas, defender a escolha e ensinar alguém

::: desafio O critério do curso
**Sênior:** 2 em todas as peças e 3 em pelo menos três.

**Staff:** além disso, conseguir conectar as peças num incidente ou numa decisão: explicar, por exemplo, como uma liveness errada derruba o deploy do Argo CD e trava o pipeline, ou como o `max` do HPA, o do KEDA e o pool de conexões precisam ser decididos juntos.

Para cada peça abaixo de 2, volte ao módulo correspondente e refaça os labs e as perguntas. Para cada uma em 3, ofereça-se para ensinar a peça a alguém do time: é o jeito mais rápido de chegar ao nível seguinte.
:::

## Para onde ir depois

- **Certificações** que este curso adiantou: [AZ-104](trilha:cert-az-104-azure-administrator), [CKA](trilha:cert-cka-kubernetes-administrator), [Confluent Kafka](trilha:cert-confluent-kafka-developer-e-administrator) e [AZ-400](trilha:cert-az-400-azure-devops-engineer).
- **Aprofundar a arquitetura:** [Sistemas Distribuídos a Fundo](trilha:nova-sistemas-distribuidos-a-fundo) e [System Design Aprofundado](trilha:decisao-system-design-aprofundado).
- **O papel de staff:** [Staff Engineer e Arquitetura Evolutiva](trilha:vol-22-staff-engineer-e-arquitetura-evolutiva).
- **No laboratório:** os próximos degraus que os guias do aks-step-by-step listam: outbox, tópico de mensagens mortas, Kafka com 3 nós e TLS, Harbor fora do cluster, traces exportados.

Parabéns por chegar até aqui. O que muda daqui para frente não é o quanto você sabe, é o quanto você consegue fazer os outros saberem.
