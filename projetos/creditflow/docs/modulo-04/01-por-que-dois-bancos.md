# 4.1 Por que dois bancos

"Persistência poliglota" é um nome bonito para uma decisão que custa caro: dois bancos para operar, monitorar, fazer backup e atualizar. Só vale se cada um resolver algo que o outro resolve mal. Esta lição faz a conta dado por dado.

## Comece pela forma e pela exigência, não pelo banco

| Dado | Forma | O que não pode acontecer | Banco |
|---|---|---|---|
| **Proposta** | Linha com estado que muda (EmAnalise → Aprovada → Contratada → Liberada) | Dois analistas decidirem a mesma proposta; um cliente com duas propostas ativas; o evento `ContratoAssinado` ser publicado sem a proposta estar gravada | **PostgreSQL** |
| **Pagamento** (módulo 6) | Linhas com dinheiro, idempotência, outbox | Pagar duas vezes | **PostgreSQL** |
| **Simulação** | Documento imutável: entrada + resultado + tabela de 6 a 48 parcelas | Perder o que o cliente viu enquanto ele decide (7 dias) | **MongoDB** |
| **Notificação** | Registro de um aviso por evento e canal; só acrescenta | Mandar o mesmo e-mail duas vezes por um evento repetido | **MongoDB** |

::: porque Por que Propostas no Postgres
As três coisas que "não podem acontecer" com a proposta são regras **entre linhas** ou **entre escritas concorrentes**. O Postgres tem as ferramentas certas e maduras: transação ACID, índice único parcial, `CHECK`, concorrência otimista por `xmin`, e a outbox na **mesma transação** da mudança de estado (módulo 6). Você pode até fazer parecido no Mongo (transações multi-documento existem desde o 4.0), mas estaria remando contra o banco, e o CreditFlow já tem Postgres para Clientes e Pagamentos.
:::

::: porque Por que Simulações no Mongo
A simulação é o endpoint **público**, sem login, e é o mais chamado do sistema. Cada simulação é lida sempre **inteira** (para virar proposta), nunca "só a parcela 7", e nunca muda depois de criada. Isso é a definição de documento. Num relacional seriam duas tabelas (simulação + 48 linhas de parcela), um `JOIN` em toda leitura, e um job de limpeza para apagar o que venceu. No Mongo: um `insertOne`, um `find` por `_id`, e um índice TTL que apaga sozinho. E o volume da simulação fica num banco separado do transacional: um robô simulando em loop não enche as tabelas de Propostas nem disputa conexões com elas.
:::

::: armadilha "Mongo é mais rápido" não é argumento
Um `SELECT` por chave primária no Postgres e um `find` por `_id` no Mongo têm latências da mesma ordem. O que muda é o **modelo**: quanto trabalho cada leitura e escrita faz para o formato do seu dado. Se alguém na entrevista justificar Mongo por velocidade, pergunte "para qual consulta?".
:::

## O que a gente **não** faz

- **Não** há chave estrangeira entre `propostas.cliente_id` e `clientes.clientes.id`. Cada módulo é dono do seu schema; uma FK entre schemas amarraria a ordem de deploy e a evolução dos dois módulos (ADR 0001). A integridade vem do caso de uso, que consulta `IConsultaDeClientes` antes de criar.
- **Não** há `JOIN` entre proposta e simulação. A proposta **copia** as condições da simulação no momento do pedido (valor, prazo, taxa, CET, parcelas). Isso é uma decisão de negócio também: o cliente aceitou **aquelas** condições; se a tabela de taxas mudar amanhã, a proposta dele não muda.
- **Não** há transação entre Postgres e Mongo. Lição 4.5.

::: previsao
A simulação vale 7 dias e o TTL do Mongo apaga o documento depois de 90. Uma proposta foi aprovada em março, contratada, e está sendo paga. Em julho, o suporte abre a proposta. O que aparece? E se a proposta **não** tivesse copiado as condições?
???
Aparece tudo: valor, taxa, CET e cronograma estão na linha da proposta (o cronograma em `jsonb`). O documento da simulação já não existe, e ninguém sente falta.

Sem a cópia, a tela quebraria (ou mostraria "simulação não encontrada") para todo contrato com mais de 90 dias, que é quase todo contrato. E aumentar o TTL "para não quebrar" transformaria um dado temporário em permanente, guardando dado pessoal sem finalidade (LGPD). A cópia é o que permite o Mongo ser descartável.
:::

## E na Azure?

O Postgres vai para o **Azure Database for PostgreSQL Flexible Server** (módulo 9). Para o Mongo há três caminhos, e a decisão está no [ADR 0004](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0004-postgres-e-mongo.md):

| Opção | Resumo |
|---|---|
| **Azure Cosmos DB for MongoDB (vCore)** | Gerenciado dentro da Azure. Fala o protocolo do Mongo, mas **não é** o MongoDB: confira cada recurso que você usa (TTL, índice parcial, `explain`) rodando os testes de integração contra ele |
| **MongoDB Atlas** (hospedado na Azure) | O MongoDB de verdade, gerenciado pela MongoDB Inc.; outro contrato e rede privada à parte |
| **Operador no cluster** | Você opera tudo: réplica, backup, disco, atualização |

::: dica A regra que vale para qualquer "compatível com X"
"Compatível com o protocolo" quer dizer que o driver conecta. Não quer dizer que todo comando, opção de índice e garantia de consistência se comportam igual. A forma barata de descobrir é a que o CreditFlow já tem: **os mesmos testes de integração** rodando contra o serviço candidato. Vale para Cosmos/Mongo, para Dragonfly/Redis (módulo 5) e para Event Hubs/Kafka.
:::

::: video MongoDB Schema Design Anti-Patterns, parte 1 (MongoDB, em inglês)
https://www.youtube.com/watch?v=8CZs-0it9r4
Arrays sem limite, documentos inchados, coleções demais: os erros clássicos de modelagem. Assista antes da lição 4.4 e confira se o documento da simulação comete algum.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que a proposta copia as condições da simulação em vez de guardar só o `simulacao_id`?
???
Porque a simulação é temporária (TTL) e mora em outro banco, sem `JOIN`; e porque, para o negócio, o cliente aceitou aquelas condições naquele momento. A cópia torna a proposta autossuficiente e permite apagar a simulação sem quebrar nada.
:::

::: pergunta
Que critério você usa para escolher entre relacional e documento?
???
A forma do dado e as regras que ele precisa garantir. Regras entre linhas e escritas concorrentes sobre o mesmo dado (unicidade, saldo, máquina de estados, outbox) pedem relacional. Agregados lidos e gravados sempre inteiros, imutáveis ou só-acrescenta, com vida curta, combinam com documento. E o custo de operar mais um banco entra na conta.
:::

**Próxima:** [4.2 EF Core por módulo](02-ef-core-por-modulo.md).
