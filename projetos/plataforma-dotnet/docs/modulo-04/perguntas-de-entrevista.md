# Perguntas de entrevista do módulo 4

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão dos módulos anteriores

::: pergunta
O que é uma atualização perdida, e como evitar num contador?
???
Duas transações leem o mesmo valor, calculam e gravam; uma sobrescreve a outra sem erro. Evita-se com comando atômico (`UPDATE ... SET x = x + 1` ou `INSERT ... ON CONFLICT DO UPDATE`), sem ler para depois gravar.
:::

::: pergunta
Por que o projeto não expõe a documentação OpenAPI em produção?
???
Para não publicar um mapa completo da API e para controlar qual versão da documentação os parceiros recebem. Em produção, as rotas nem são mapeadas.
:::

## Cache

::: entrevista
"Como você decide se um dado pode ser cacheado, e por quanto tempo?"
???
Pergunto quanto tempo o dado pode ficar desatualizado sem prejuízo e quem aceita isso, com que frequência ele muda e com que frequência é lido, e o que acontece se o cache sumir. A validade sai da primeira resposta. Lembrando que, com várias camadas, o pior caso de desatualização é a validade mais longa da cadeia. E o sistema tem que funcionar sem o cache: ele acelera, não é a fonte da verdade.
:::

::: entrevista
"Por que usar cache local e distribuído ao mesmo tempo?"
???
O local (memória do processo) não tem rede: é o mais rápido e funciona com o distribuído fora. O distribuído é compartilhado entre réplicas: uma ida à origem serve todas. Uso validade curta no local, para limitar quanto tempo as réplicas divergem e quanto tempo uma invalidação demora para chegar a todas. No .NET, o HybridCache junta as duas camadas.
:::

::: entrevista
"O que é cache stampede e como você evita?"
???
Uma chave popular some do cache e muitas requisições vão à origem ao mesmo tempo. Evito com coalescência por chave: a busca roda uma vez e as outras esperam o resultado (o `GetOrCreateAsync` do HybridCache faz isso por processo). Entre processos, sobra até uma ida por instância; se nem isso for aceitável, trava distribuída ou renovação antecipada da chave antes de vencer. E confiro se o desenho do código não está contornando a proteção, o que é fácil de acontecer.
:::

::: entrevista
"O Redis caiu. O que acontece com a sua aplicação?"
???
Deveria ficar mais lenta, não fora. Para isso: a aplicação sobe sem o cache (`abortConnect=false`), cada operação no cache tem timeout curto para cache lento virar cache ausente, a leitura cai para o banco, e nada é gravado só no cache. Os erros aparecem em logs e métricas para alguém agir, mas não chegam ao cliente.
:::

::: entrevista
"Como invalidar cache quando o dado muda?"
???
Primeiro pergunto se precisa: muitas vezes uma validade curta resolve. Se precisa, removo a chave na mesma operação que muda o dado (ou por evento), usando tags para grupos de chaves. Com cache em duas camadas, a remoção chega ao distribuído e ao local de quem removeu; os outros locais esperam a validade curta, ou recebem um aviso por pub/sub se a divergência de minutos não for aceitável.
:::

**Próximo módulo:** [Módulo 5: Kafka](../modulo-05/README.md).
