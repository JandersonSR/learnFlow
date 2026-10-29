# 12.1 Game day: o incidente simulado

::: conceito Game day
Um exercício em que se quebra o ambiente **de propósito**, num horário combinado, para treinar o diagnóstico e testar se os alarmes, os runbooks e as pessoas funcionam. Empresas grandes fazem isso em produção; você vai fazer no laboratório.
:::

## Regras

1. **A plantonista recebe só o sintoma**, como num chamado de parceiro. Não lê o roteiro da facilitadora.
2. **Anote a linha do tempo** enquanto investiga: hora, o que olhou, o que viu, o que concluiu. É o material do post-mortem (lição 12.2).
3. **Primeiro estancar, depois consertar.** Se houver um jeito de devolver o serviço rápido (voltar uma versão, desligar algo), faça e anote, antes de buscar a causa raiz.
4. **Dicas em níveis**: abra uma só quando estiver travada há mais de 20 minutos.
5. No fim, a facilitadora revela o que fez, e as duas comparam com a linha do tempo.

Os três cenários abaixo têm um bloco **"Roteiro da facilitadora"** recolhido. A plantonista não abre.

---

## Cenário A: "os CEPs novos estão dando erro"

**Ambiente:** local, `docker compose`.

::: desafio O chamado
> "Bom dia. Desde as 9h, parte das consultas está voltando com erro 503 e demorando muito, uns 8 segundos. Os CEPs que a gente consulta sempre continuam funcionando normal. Correlation id de um dos erros: `parceiro-x-0915`."

Encontre a causa, devolva o serviço e explique por que **alguns** CEPs funcionam e outros não.
:::

::: dica Roteiro da facilitadora (a plantonista não abre)
Antes de chamar a plantonista, no `docker-compose.yml`, no serviço `api`, acrescente a variável:

```yaml
Cep__ViaCepUrl: http://10.255.255.1/ws/
```

e rode `docker compose up -d api`. O endereço é um IP que não responde: toda chamada à fonte espera o timeout. Faça algumas consultas a CEPs já conhecidos (para eles estarem em cache) e mande a mensagem do chamado. Para mandar um erro com o correlation id do chamado: `curl -s localhost:8080/v1/cep/04538133 -H "X-Correlation-Id: parceiro-x-0915"`.
:::

::: dica Dica 1
O que os CEPs que funcionam têm em comum com os que falham? Olhe os cabeçalhos `X-Cache` e `X-Cache-Camada` de cada um.
:::

::: dica Dica 2
Procure nos logs da API pelo correlation id do chamado: `docker compose logs api | grep parceiro-x-0915`. E pense no que leva 8 segundos no `CepModulo`.
:::

::: solucao Resolução
- **O padrão:** CEPs em cache respondem com `X-Cache: HIT` (camada `memoria` ou `banco`); CEPs novos vão à fonte e falham com 503 (`codigo: 9001`, "Fonte de CEP indisponível").
- **Os 8 segundos** são o `TotalRequestTimeout` do `AddStandardResilienceHandler` (tentativas de 3 s até o total de 8 s, lição 4.3 e `CepModulo`).
- **Nos logs**, pelo correlation id: "Fonte indisponível e CEP 04538133 sem cache".
- **Causa:** a URL do ViaCEP aponta para um endereço que não responde (`Cep__ViaCepUrl` na configuração).
- **Correção:** remover a variável e subir a API de novo.

**O que o desenho fez certo:** a API não caiu; o cache em três camadas segurou tudo o que já era conhecido, e o 503 veio rápido o suficiente para não acumular requisições. E se houvesse um CEP vencido no banco, ele teria sido servido como `STALE` em vez de 503.

**Melhorias para o post-mortem:** um alerta pela proporção de `MISS` com erro, ou de `STALE`, na métrica `cep.consultas` (lição 8.4); validar a `ViaCepUrl` com um teste de conectividade na subida (com cuidado para não impedir a API de subir por causa de uma dependência externa).
:::

---

## Cenário B: "o ranking parou"

**Ambiente:** local, `docker compose`.

::: desafio O chamado
> "O ranking de CEPs mais consultados não muda desde a hora do almoço, mas as consultas estão funcionando normalmente. A gente usa esse ranking num painel comercial."

Encontre a causa, faça o ranking voltar a atualizar **sem perder nenhuma consulta feita durante o problema**, e explique por que nenhuma se perdeu.
:::

::: dica Roteiro da facilitadora (a plantonista não abre)
No `docker-compose.yml`, no serviço `worker`, troque o `ConnectionStrings__Cep` para usar uma senha errada (por exemplo, acrescente `x` ao final de `Password=${POSTGRES_PASSWORD}`), e rode `docker compose up -d worker`. Depois faça umas 20 consultas variadas (`for c in 01001000 20040020 01310100; do curl -s localhost:8080/v1/cep/$c > /dev/null; done`, repetido) e mande o chamado.
:::

::: dica Dica 1
O ranking é calculado por quem? A partir de quê? (Lição 5.3.) Olhe primeiro o atraso do grupo de consumidores.
:::

::: dica Dica 2
`docker compose logs worker --since 10m`. O que o worker está fazendo com o mesmo evento, de novo e de novo?
:::

::: solucao Resolução
- **O atraso** (`kafka-consumer-groups.sh --describe --group cep-estatisticas`) cresce a cada consulta: os eventos estão chegando ao tópico, e ninguém está confirmando.
- **Os logs do worker** mostram "Falha ao gravar a consulta do CEP ...; nova tentativa em N s", com erro de autenticação do PostgreSQL (`password authentication failed`), repetindo o mesmo evento com espera crescente até 30 s.
- **Causa:** a connection string do worker com a senha errada.
- **Correção:** corrigir a senha e subir o worker. Ele retoma do último offset confirmado, drena o atraso, e o ranking soma todas as consultas do período.

**Por que nada se perdeu:** commit manual do offset só depois de gravar (lição 5.3). O worker ficou parado no primeiro evento que não conseguia gravar, sem avançar, e os outros esperaram no tópico (retenção de 7 dias).

**Melhorias para o post-mortem:** alerta pelo atraso do grupo crescendo por mais de N minutos (a escala do KEDA não teria ajudado: lição 5.4); a readiness do worker inclui o banco, então, no cluster, o pod ficaria `0/1` e isso também poderia alertar.
:::

---

## Cenário C: "o deploy novo não sobe"

**Ambiente:** Minikube, com a preparação da [lição 7.4](../modulo-07/04-labs-de-quebra.md).

::: desafio O chamado
> "Publiquei uma versão com uma mudança de configuração e o pipeline ficou esperando até dar timeout. A API continua respondendo, mas não sei qual versão está no ar. Preciso publicar a correção de um bug hoje."

Descubra o que está acontecendo, explique por que a API continua respondendo, e deixe o ambiente pronto para o próximo deploy.
:::

::: dica Roteiro da facilitadora (a plantonista não abre)
Com a revisão boa instalada (lição 7.4), rode:

```bash
helm upgrade cep-api charts/cep-api -n cep $VALORES --set-string config.Cep__ValidadeEmDias=0 --wait --timeout 10m
```

e interrompa com Ctrl+C depois de uns 30 segundos. Depois mande o chamado.
:::

::: dica Dica 1
Dois problemas se sobrepõem: um no deploy e um no Helm. Comece pelo `helm history` e pelo `kubectl get pods`.
:::

::: dica Dica 2
O pod novo está em que estado? O que o `logs --previous` dele diz? E qual o status da última revisão no `helm history`?
:::

::: solucao Resolução
- **O pod novo** entra em `CrashLoopBackOff`. O `kubectl logs --previous` mostra a falha de validação na subida: `ValidadeEmDias` precisa estar entre 1 e 365 (o `[Range(1, 365)]` da `CepOptions` com `ValidateOnStart`, lição 6.4).
- **A API continua respondendo** porque o rolling update tem `maxUnavailable: 0`: os pods velhos só saem quando um novo fica pronto, e nenhum novo ficou (lições 6.3 e 7.4, lab 2).
- **O Helm** ficou com a revisão em `pending-upgrade`, porque o processo foi interrompido (lição 7.4, lab 3): o próximo deploy seria recusado com `another operation is in progress`.
- **Correção:** confirmar que não há outro deploy em andamento, `helm rollback cep-api <última revisão deployed> -n cep --wait`, e corrigir o valor antes de publicar de novo.

**O que o desenho fez certo:** a validação na subida transformou uma configuração errada num erro claro e imediato, e o rolling update conservador manteve o serviço no ar.

**Melhorias para o post-mortem:** um `values.schema.json` no chart, que reprovaria `ValidadeEmDias=0` no `helm lint` do PR (lição 7.4, lab 1); `--atomic`/`--rollback-on-failure` no deploy, para voltar sozinho; e, com o Argo CD (módulo 11), o pipeline nem teria um `helm upgrade` para ser interrompido.
:::

---

## Depois de cada cenário

Com a linha do tempo anotada, faça a reunião de 15 minutos com a facilitadora:

1. Quanto tempo do sintoma até a causa? E até o serviço voltar?
2. Qual foi o primeiro comando que realmente ajudou? Quanto tempo se gastou antes dele?
3. Que alerta, painel ou runbook teria encurtado o caminho?

As respostas são o post-mortem da próxima lição.
