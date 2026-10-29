# Perguntas de entrevista do módulo 8

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão dos módulos anteriores

::: pergunta
Qual a diferença de consequência entre readiness e liveness?
???
Readiness falhando tira o pod do tráfego, sem reiniciar. Liveness falhando reinicia o contêiner. Dependências externas só na readiness.
:::

::: pergunta
Que problema o padrão outbox resolve?
???
O duplo registro: gravar no banco e publicar na mensageria sem transação entre os dois. O evento vai para uma tabela na mesma transação do dado, e um retransmissor publica depois, com entrega "pelo menos uma vez".
:::

## Produção na Azure

::: entrevista
"Como seu pipeline se autentica na nuvem?"
???
Por federação de identidade (OIDC): o GitHub emite um token para a execução, e a Azure confia nele por uma credencial federada restrita ao repositório e ao environment. Não existe segredo de longa duração. O service principal tem papéis só nos recursos que publica (o registry e o cluster), e o environment de produção exige aprovação.
:::

::: entrevista
"Como uma aplicação no AKS lê segredos sem guardar senha?"
???
Workload Identity: o pod usa o token da própria ServiceAccount, assinado pelo emissor OIDC do cluster; uma identidade gerenciada com credencial federada para aquele namespace e ServiceAccount troca o token por acesso, e só tem o papel de ler segredos naquele cofre. O driver CSI monta os segredos como arquivo e relê periodicamente, e a aplicação recarrega a configuração, o que permite rotação sem reinício.
:::

::: entrevista
"Como você expõe uma API no Kubernetes com HTTPS?"
???
Um controlador de Ingress (NGINX) com um IP de entrada para o cluster, um Ingress por aplicação com host e TLS, e o cert-manager emitindo e renovando os certificados automaticamente. O Service da aplicação vira `ClusterIP`. E a aplicação processa os cabeçalhos `X-Forwarded-*`, senão vê o IP do proxy em vez do cliente, o que quebra rate limiting e logs.
:::

::: entrevista
"Um cliente reclama de um erro de ontem. Como você investiga?"
???
Peço o id de correlação que devolvemos no corpo do erro e no cabeçalho. Com ele, uma consulta nos logs centralizados traz todas as linhas daquela requisição, de qualquer pod, inclusive de pods que já não existem. Sem o id, filtro por janela de tempo, rota e status para achá-lo. Logs estruturados em JSON, com o id e a versão em toda linha, são o que torna isso possível.
:::

::: entrevista
"Como você garante que a aplicação aguenta picos e manutenções?"
???
HPA pela CPU com janela de estabilização para descer, cluster autoscaler para quando os pods não cabem, PodDisruptionBudget para manutenções, réplicas espalhadas por nós, rolling update sem indisponibilidade e encerramento gracioso. E provo com teste de carga com critério de reprovação (p95 e taxa de erro), inclusive com deploy durante a carga. Sem esquecer folga mínima, porque criar nó leva minutos, e o limite de conexões do banco quando os pods multiplicam.
:::

::: entrevista
"Que métricas você alertaria para uma API como esta?"
???
Taxa de erro 5xx e latência p95 por rota (os sinais que o cliente sente), reinícios de pods, saturação (CPU e memória contra o limite, conexões do banco), e as de negócio que indicam dependência com problema: aqui, a proporção de respostas `STALE`, que diz que a fonte externa caiu. Alerto por métrica, que é barata e estável, e uso log para investigar.
:::

**Próximo módulo:** [Módulo 9: Terraform](../modulo-09/README.md).
