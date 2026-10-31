# Perguntas de entrevista do módulo 1

Responda em voz alta, antes de abrir. Uma boa resposta de sênior tem a decisão, o motivo e o custo, nessa ordem, em menos de dois minutos.

::: entrevista
"O que é um monolito modular e quando você escolheria um em vez de microsserviços?"
???
Um único deploy com módulos de fronteira forte: cada módulo é um contexto de negócio com dados próprios (schema), um contrato público pequeno e regras de dependência verificadas por teste. Escolho quando o time é pequeno ou médio e ainda não sei quais partes vão precisar de escala, ritmo de deploy ou tecnologia diferentes. Ganho: um build, transação local onde importa, refactor barato entre módulos. Custo: um bug pode derrubar o processo e todos sobem na mesma versão de runtime. Revisito quando um módulo precisar de time, deploy ou tecnologia próprios; aí a extração é barata porque a fronteira já existe.
:::

::: entrevista
"Como você escala uma parte de um monolito sem quebrá-lo em serviços?"
???
Perfis de execução: a mesma imagem sobe em vários deployments, cada um com uma lista de módulos e um papel (api ou worker). No CreditFlow, Simulação roda sozinha e escala por CPU; o worker de Pagamentos escala pelo lag do Kafka. O Ingress roteia por caminho. Custo: a configuração vira arquitetura, então valido na subida e derrubo o processo com módulo desconhecido; e módulos não podem supor que outro está no mesmo processo, só o que vem pelos contratos.
:::

::: entrevista
"Como você garante que os módulos não se acoplem com o tempo?"
???
Em camadas. Projeto `.Contracts` como única coisa referenciável; tipos internos `internal`. Testes de arquitetura em duas frentes: lendo os `.csproj` (pega referência ainda sem uso, que o compilador descarta) e lendo o IL com NetArchTest (pega dependência indireta, como domínio usando ASP.NET). No banco, schema e usuário por módulo. E um teste sentinela para a descoberta de módulos não passar vazia. Disciplina não escala; regra que quebra o build escala.
:::

::: entrevista
"Para que serve o `Directory.Packages.props`?"
???
Gestão central de pacotes: a versão de cada pacote NuGet mora num lugar só, e os `.csproj` referenciam só o nome. Com pinagem transitiva, vale também para dependências indiretas. Evita a mesma biblioteca em versões diferentes em projetos diferentes, que vira erro em tempo de execução. A exceção (`VersionOverride`) é explícita e aparece no code review.
:::

::: entrevista
"Exceção ou Result para erro de validação?"
???
Result. Validação é falha prevista, acontece todo dia e faz parte da regra: deve estar na assinatura do método para quem chama tratar. Exceção fica para o imprevisto (banco fora, bug) e é tratada num lugar só, que devolve 500 em ProblemDetails sem vazar a pilha. Além de clareza, exceção custa caro: captura a pilha inteira.
:::

::: entrevista
"Como seu Host descobre os módulos? Por que não por reflexão?"
???
Lista explícita no `Program.cs`, filtrada pela configuração. Reflexão depende de o assembly estar carregado, quebra com trimming/AOT e esconde o que o sistema tem. Uma linha por módulo, num lugar óbvio, aparece no diff.
:::

::: entrevista
"Num pod que só roda o módulo A, o módulo A precisa consultar o módulo B de forma síncrona. Como você resolve?"
???
Três opções: HTTP para o pod que tem B (desacopla o deploy, mas traz latência, retry e dependência de disponibilidade); cópia local por eventos (o mais desacoplado, com consistência eventual); ou registrar só a implementação do contrato de B, sem endpoints nem jobs, lendo o mesmo banco (simples e consistente, mas o pod precisa de acesso ao schema de B). No CreditFlow escolhi a terceira por ainda ser um monolito, com o ADR dizendo que a segunda é o caminho se Simulação virar serviço.
:::

::: entrevista
"Por que a ordem dos middlewares importa? Dê um exemplo que quebra."
???
Cada middleware envolve os seguintes, na ordem em que foi adicionado. `UseExceptionHandler` depois de outro middleware não captura exceções desse middleware. `UseAuthorization` antes de `UseAuthentication` avalia políticas sem usuário e devolve 401 para todo mundo. Rate limit antes de autenticação não consegue limitar por usuário, só por IP.
:::

::: entrevista
"O que é ProblemDetails e por que padronizar o erro?"
???
RFC 9457, um corpo de erro JSON padrão com `type`, `title`, `status`, `detail` e extensões. Padronizar dá ao front um tratador único e ao suporte um `traceId` para achar a requisição. Acrescento um `code` estável, porque mensagem muda e status é grosso demais.
:::

::: entrevista
"Por que `docker compose` com `depends_on: condition: service_healthy` não basta para a aplicação ser robusta?"
???
Porque só existe no Compose. No Kubernetes não há ordem de subida: o banco pode cair a qualquer momento e a aplicação precisa reconectar e tentar de novo, e a readiness tira o pod do balanceamento enquanto a dependência estiver fora. O `depends_on` é conforto de ambiente local, não garantia.
:::
