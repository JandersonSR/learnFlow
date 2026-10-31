# 8.5 Apresentar o OrderFlow ao time

Saber decidir não basta: a decisão só vale se o time entende, concorda o suficiente para seguir, e
consegue operar sem você. Esta lição monta uma apresentação de 25 minutos do OrderFlow para um time
de desenvolvedores júnior e pleno, que é também o ensaio da entrevista da lição 8.6.

## Comece pelo público, não pelo sistema

| Público | Quer saber | Não quer |
|---|---|---|
| devs júnior/pleno do time | como isto muda o meu dia: onde mexo, como testo, o que quebra | a história das decisões em detalhe |
| outros tech leads | as decisões e os trade-offs, para copiar ou contestar | tutorial de Kafka |
| gestão/produto | prazo, risco, custo, o que o cliente ganha | nomes de tecnologia |
| plantão/suporte | como saber que está quebrado e o que fazer | como foi construído |

A mesma arquitetura, quatro apresentações. Esta lição faz a primeira.

## O roteiro de 25 minutos

| Min | Bloco | Conteúdo | Material |
|---|---|---|---|
| 0–3 | **O problema** | "Um pedido some entre o Orders e o Payments. Hoje, como você descobriria onde?" Deixe o silêncio fazer o trabalho | — |
| 3–8 | **O sistema em uma figura** | o diagrama do README: dois serviços, dois tópicos, nunca se chamam | `README.md` |
| 8–14 | **Uma requisição de ponta a ponta, ao vivo** | `POST /orders`, e o trace no Tempo, atravessando .NET → Kafka → Java → Kafka → .NET | lição 7.4 |
| 14–19 | **Três regras que o time precisa seguir** | (1) consumidor idempotente; (2) campo novo em evento é opcional, consumidor implanta antes; (3) migration só aditiva | ADRs 0004, 0005, lição 7.7 |
| 19–22 | **Onde olhar quando quebrar** | o painel, um alerta, o runbook correspondente | lição 7.5, `docs/runbooks/` |
| 22–25 | **Perguntas** | com uma pergunta sua pronta, caso ninguém comece | — |

::: porque Uma demonstração vale dez slides
O bloco 8–14 é o centro. Ver um trace atravessar duas linguagens e um broker é o momento em que
"observabilidade" deixa de ser palavra e vira ferramenta. Deixe tudo pronto antes (LGTM de pé, um
`curl` num arquivo, o Tempo já aberto na busca), porque demo que falha ao vivo consome a
credibilidade da apresentação inteira. Grave um vídeo de reserva.
:::

::: dica Contar histórias, não arquiteturas
Abra cada regra com o incidente que ela evita, não com a regra. "Se o Payments receber o mesmo
`OrderCreated` duas vezes, o cliente é cobrado duas vezes" fica na memória; "consumidores devem
ser idempotentes" não. As três regras do bloco 14–19 têm, cada uma, o incidente correspondente nos
ADRs (seção Contexto): use-os.
:::

## Três regras, e não trinta

O time não vai lembrar de oito ADRs. Escolha **o que, se esquecido, causa incidente**, e repita.
No OrderFlow:

1. **Todo consumidor é idempotente.** O Kafka entrega pelo menos uma vez. (ADR 0004)
2. **Evento só ganha campo opcional, e o consumidor sobe antes do produtor.** (ADR 0005)
3. **Migration só adiciona; remoção é num deploy posterior.** (lição 7.7)

Coloque as três no template de PR como checklist. Uma regra que só existe na apresentação dura
uma semana; no template, dura enquanto o template existir.

## As perguntas difíceis, e respostas que funcionam

Prepare-se para estas, que aparecem em todo time:

| Pergunta | Resposta que funciona |
|---|---|
| "Por que tão complicado? Não dava para ser um serviço só?" | "Dava, e para o nosso volume seria até mais barato. Fizemos assim por X (o ADR 0001 explica). Se X deixar de valer, o ADR diz quando revisitar." Concordar com a parte verdadeira desarma a pergunta |
| "Quem cuida do Kafka?" | a resposta honesta, com nome; se a resposta é "ninguém ainda", é um risco a registrar, não a esconder |
| "Eu vou ter que aprender Java?" | o que cada um precisa saber para o plantão, e o material (Módulo 1-J); e o que **não** precisa |
| "Isso não vai deixar o deploy mais lento?" | os números do pipeline (CI em paralelo, deploy de dev automático) |

::: armadilha Defender tudo
O instinto de quem desenhou é defender cada escolha. Num time, isso ensina que questionar não
adianta, e as pessoas param de apontar problemas, que é o pior resultado possível para quem lidera.
Admitir "essa foi uma aposta, e pode estar errada; o sinal de que está errada é tal número" ganha
mais confiança do que qualquer defesa.
:::

## Depois da apresentação

- Publique os slides e a gravação junto do repositório (link no `README.md`).
- Abra issues com as perguntas que ficaram sem resposta, com dono.
- Em duas semanas, confira se as três regras estão no template de PR e se alguém além de você já
  abriu o painel do Grafana sozinho. Esse é o indicador de que a apresentação funcionou.

## Perguntas para responder sem olhar

::: pergunta
O que muda numa apresentação da mesma arquitetura para o time de devs e para a gestão?
???
Para o time: como muda o dia a dia, onde mexer, as regras que evitam incidente, onde olhar quando
quebrar, com demonstração. Para a gestão: risco, prazo, custo e ganho para o cliente, sem nome de
tecnologia. A arquitetura é a mesma; o recorte é do público.
:::

::: pergunta
Por que escolher só três regras para o time, e onde colocá-las?
???
Porque ninguém retém oito decisões, e as que importam para o dia a dia são as que causam incidente
se esquecidas. Coloco no template de PR como checklist, para que a regra viva no fluxo de trabalho
e não na memória de uma apresentação.
:::

**Próxima:** [8.6 Roteiro de entrevista staff com o OrderFlow](06-entrevista-staff.md).
