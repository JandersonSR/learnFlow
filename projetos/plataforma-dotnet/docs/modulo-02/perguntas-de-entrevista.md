# Perguntas de entrevista do módulo 2

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão dos módulos anteriores

::: pergunta
Quando usar `Resultado<T>` e quando lançar exceção?
???
`Resultado<T>` para falha prevista, que faz parte do negócio (não encontrado, regra violada, validação). Exceção para o que não deveria acontecer, que vira 500, log e alerta.
:::

::: pergunta
Por que o seletor de um Deployment não pode conter a versão da aplicação?
???
Porque o `selector` é imutável. Com a versão dentro, cada upgrade mudaria o seletor e o Kubernetes recusaria a atualização.
:::

## Contrato de API

::: entrevista
"Como você documenta uma API REST em .NET hoje?"
???
Gero a especificação OpenAPI pelo código com o `Microsoft.AspNetCore.OpenApi` (que substituiu o Swashbuckle nos templates desde o .NET 9) e mostro com uma interface como Scalar ou Swagger UI. Cada endpoint declara nome, resumo, o tipo do sucesso e **todos** os erros possíveis em ProblemDetails. Em produção, a documentação fica desligada e entrego a especificação revisada aos parceiros. E protejo o contrato com um teste que compara a especificação gerada com a versão aprovada no repositório.
:::

::: entrevista
"Qual a sua estratégia de versionamento de API?"
???
Versão na URL, porque é visível em logs, fácil de rotear e de testar. Dentro de uma versão, só mudanças aditivas: campos e parâmetros opcionais novos, endpoints novos. Mudança incompatível vira uma versão nova ao lado da antiga, com `Deprecation` e `Sunset` na antiga, medição de uso por parceiro e desligamento só quando o uso zerar. E evito a mudança incompatível sempre que dá, porque manter duas versões custa caro.
:::

::: entrevista
"O que é um leitor tolerante e por que ele importa?"
???
Um cliente que ignora campos que não conhece e não depende de ordem nem de campos opcionais. É o que permite ao servidor acrescentar campos sem quebrar ninguém. Do lado do servidor, eu escrevo no contrato que campos novos e valores novos podem aparecer, para quem integra não usar desserialização estrita.
:::

::: entrevista
"Como você padroniza erros numa API?"
???
ProblemDetails (RFC 9457) para tudo, inclusive 404 de rota, 405 e 429, com um código numérico estável por tipo de erro e o id de correlação. O código é para a máquina decidir, o título para a pessoa ler, o id para o suporte achar a requisição. A tradução de erro de negócio para status HTTP fica num lugar só.
:::

::: entrevista
"Para que serve um id de correlação, e que cuidado ele exige?"
???
Para ligar uma chamada do parceiro aos logs, aos traces e aos eventos que ela gerou, e para o suporte achar tudo por um id. Aceito o id do parceiro quando ele manda, gero um quando não manda, e devolvo na resposta. O cuidado: o valor vem de fora e vai para log e cabeçalho, então limito tamanho e caracteres para evitar log forging.
:::

::: entrevista
"Acrescentar um valor novo a um enum da resposta é compatível?"
???
Só se o contrato prometeu desde o início que a lista pode crescer e que valores desconhecidos devem ter um tratamento genérico. Caso contrário, quebra quem tratou os valores de forma exaustiva ou gerou um enum estrito a partir da especificação. Na dúvida, trato como incompatível.
:::

**Próximo módulo:** [Módulo 3: PostgreSQL e EF Core em produção](../modulo-03/README.md).
