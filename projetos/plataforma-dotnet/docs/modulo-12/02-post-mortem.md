# 12.2 Post-mortem sem culpados

::: conceito Post-mortem sem culpados (*blameless*)
Um documento escrito depois de um incidente para entender **como o sistema permitiu** que ele acontecesse e o que muda para não repetir. "Sem culpados" não é ser bonzinho: é reconhecer que, se uma pessoa conseguiu derrubar produção com um comando, o problema está no sistema que permitiu, e que gente com medo de punição esconde informação, o que torna o próximo incidente pior.
:::

## Por que escrever

- **A memória do time é curta.** Daqui a seis meses, ninguém lembra por que existe aquele alerta ou aquela validação. O post-mortem lembra.
- **Escrever força a entender.** "O worker parou" vira "o worker repetiu o mesmo evento por 40 minutos porque a senha estava errada, e nenhum alerta olha o atraso do grupo".
- **É a matéria-prima de sênior e staff.** Em entrevistas, "conte um incidente que você resolveu" é pergunta certa, e quem escreveu post-mortems responde com estrutura.

## O modelo

Copie e preencha para o cenário que você fez no game day. Uma página; se passar de duas, está longo demais.

```markdown
# Post-mortem: <título curto, pelo sintoma>

**Data:** <dia>  ·  **Duração do impacto:** <do início ao serviço normal>  ·  **Severidade:** <1 a 4>
**Autor(a):** <nome>  ·  **Revisado por:** <nome>

## Resumo
<Três frases: o que o cliente sentiu, a causa, como foi resolvido.>

## Impacto
<Quem foi afetado, quanto (porcentagem de requisições, quais funções), por quanto tempo. Números, não adjetivos.>

## Linha do tempo (horário de Brasília)
- 09:00 <primeiro sinal, mesmo que ninguém tenha visto>
- 09:15 <chamado do parceiro>
- 09:22 <primeira hipótese e o que foi olhado>
- 09:40 <causa encontrada>
- 09:45 <serviço normalizado>

## Causa raiz e fatores que contribuíram
<A causa técnica, e as condições que deixaram ela causar impacto: por que não houve alerta, por que a validação não pegou.
Use "cinco porquês" até chegar a algo que se possa mudar no sistema, não numa pessoa.>

## O que funcionou
<O que limitou o estrago: o cache, o rolling update, o commit manual do offset. Também merece registro.>

## Ações
| Ação | Tipo | Responsável | Prazo |
|---|---|---|---|
| <ex.: alerta pelo atraso do grupo cep-estatisticas> | Detectar | <nome> | <data> |
| <ex.: values.schema.json no chart> | Prevenir | <nome> | <data> |
| <ex.: runbook "ranking parou"> | Responder | <nome> | <data> |
```

## O que separa um post-mortem bom de um ruim

| Ruim | Bom |
|---|---|
| "O dev configurou a senha errada" | "A configuração do worker aceita uma senha errada sem falhar na subida, e nenhum alerta olha o atraso do grupo" |
| "Vamos tomar mais cuidado" | "Alerta quando o atraso de `cep-estatisticas` passar de 500 por 10 minutos, responsável e prazo" |
| Linha do tempo só com a correção | Linha do tempo com o **primeiro sinal**, mesmo que ninguém tenha visto: mostra quanto tempo o problema existiu sem ser detectado |
| Só o que deu errado | Também o que deu certo e limitou o estrago |
| Ações sem dono | Cada ação com responsável e data |

::: armadilha "Erro humano" como causa raiz
Se a causa raiz termina numa pessoa ("fulano errou"), o post-mortem parou cedo. Pergunte mais um porquê: **por que o sistema deixou** um erro comum chegar a produção? Faltou validação, teste, revisão, alerta? É aí que a ação útil está.
:::

::: desafio
Escreva o post-mortem do cenário que você fez no game day, com a linha do tempo real que você anotou.

**Critérios de aceite:**
- Cabe em uma página
- O impacto tem números
- A causa raiz termina em algo que se pode mudar no sistema
- Pelo menos uma ação de **detectar** (alerta ou painel) e uma de **prevenir** (validação, teste)
- Alguém (a facilitadora, ou um colega) leu e revisou
:::

**Próxima:** [12.3 ADRs](03-adrs.md).
