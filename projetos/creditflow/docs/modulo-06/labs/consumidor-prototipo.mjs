// Protótipo da lógica do ConsumidorKafka.cs, sem broker: uma partição em memória, offsets, commit, seek.
// Política (igual ao C#):
//  - Permanente  -> DLT na 1ª falha, guarda offset, segue
//  - Desconhecida-> retry com backoff; DLT ao atingir maxTentativasAntesDaDlt (contando através de seeks)
//  - Transitoria -> retry com backoff enquanto a espera acumulada couber em 30 s; depois SEEK para o mesmo offset e volta ao poll
//                   (nunca vai para a DLT; o poll continua acontecendo, o grupo não expulsa o consumidor)
//  - Inbox: id do evento já processado -> ignora (duplicata por reentrega)
class ErroPermanente extends Error {}
class ErroTransitorio extends Error {}
const classificar = (e) => (e instanceof ErroPermanente || e instanceof SyntaxError) ? "Permanente" : e instanceof ErroTransitorio ? "Transitoria" : "Desconhecida";

function criarAmbiente(mensagens, opts) {
  let relogio = 0; // ms simulados
  const log = { particao: mensagens, posicao: 0, comitado: 0 };
  const estado = { dlt: [], efeitos: [], inbox: new Set(), polls: [], tentativas: new Map() };
  const consumidor = {
    consume() { estado.polls.push(relogio); relogio += 5; return log.posicao < log.particao.length ? { offset: log.posicao, ...log.particao[log.posicao++] } : null; },
    seek(offset) { log.posicao = offset; },
    storeOffset(offset) { log.armazenado = offset + 1; },
    commit() { log.comitado = log.armazenado ?? log.comitado; },
    crash() { log.posicao = log.comitado; }, // outra réplica assume a partição a partir do último commit
  };
  const dormir = (ms) => { relogio += ms; };
  return { consumidor, estado, dormir, log, agora: () => relogio };
}

function backoff(t, base = 500, max = 30000) { return Math.min(max, base * 2 ** (t - 1)); } // jitter omitido no protótipo

function laco(amb, manipular, { janelaEmMemoriaMs = 30000, maxTentativasAntesDaDlt = 10, crashAposProcessarOffset = -1 } = {}) {
  const { consumidor, estado, dormir } = amb;
  let crashFeito = false;
  for (let guard = 0; guard < 10000; guard++) {
    const msg = consumidor.consume();
    if (!msg) return;
    const chaveTent = msg.offset;
    let seekou = false, esperadoEmMemoria = 0;
    for (;;) {
      const total = (estado.tentativas.get(chaveTent) ?? 0) + 1;
      estado.tentativas.set(chaveTent, total);
      try {
        if (!estado.inbox.has(msg.id)) {          // inbox (no C#: INSERT ON CONFLICT na transação do efeito)
          manipular(msg, total, amb.agora());
          estado.inbox.add(msg.id); estado.efeitos.push(msg.id);
        }
        break;
      } catch (e) {
        const tipo = classificar(e);
        if (tipo === "Permanente" || (tipo === "Desconhecida" && total >= maxTentativasAntesDaDlt)) {
          estado.dlt.push({ id: msg.id, motivo: tipo, tentativas: total, erro: e.message }); break;
        }
        const espera = backoff(total);
        if (esperadoEmMemoria + espera > janelaEmMemoriaMs) { consumidor.seek(msg.offset); seekou = true; break; } // volta ao poll
        esperadoEmMemoria += espera; dormir(espera);
      }
    }
    if (seekou) continue;                          // não guarda offset: a mesma mensagem volta no próximo poll
    estado.tentativas.delete(chaveTent);
    if (msg.offset === crashAposProcessarOffset && !crashFeito) { crashFeito = true; consumidor.crash(); continue; } // morreu antes do commit
    consumidor.storeOffset(msg.offset); consumidor.commit();
  }
  throw new Error("laço não terminou");
}

let falhas = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

// Cenário 1: mensagem envenenada (JSON inválido) no meio
{
  const amb = criarAmbiente([{ id: "a" }, { id: "lixo", corpo: "{não é json" }, { id: "b" }], {});
  laco(amb, (m) => { if (m.corpo) JSON.parse(m.corpo); });
  ok(amb.estado.dlt.length === 1 && amb.estado.dlt[0].tentativas === 1, "envenenada vai para a DLT na 1ª tentativa");
  ok(amb.estado.efeitos.join() === "a,b", "partição não trava: a e b processados em ordem");
}
// Cenário 2: banco fora por 3 minutos simulados (transitória)
{
  const amb = criarAmbiente([{ id: "a" }, { id: "b" }, { id: "c" }], {});
  laco(amb, (m, t, agora) => { if (m.id === "b" && agora < 180000) throw new ErroTransitorio("banco fora"); });
  const polls = amb.estado.polls; let maiorIntervalo = 0;
  for (let i = 1; i < polls.length; i++) maiorIntervalo = Math.max(maiorIntervalo, polls[i] - polls[i - 1]);
  ok(amb.estado.dlt.length === 0, "transitória nunca vai para a DLT");
  ok(amb.estado.efeitos.join() === "a,b,c", "ordem preservada depois que o banco volta");
  ok(maiorIntervalo <= 30005, `poll continua acontecendo (maior intervalo entre polls ${maiorIntervalo} ms <= janela de 30 s, longe do max.poll.interval.ms de 300 s)`);
}
// Cenário 3: bug (exceção desconhecida) sempre
{
  const amb = criarAmbiente([{ id: "a" }, { id: "bug" }, { id: "b" }], {});
  laco(amb, (m) => { if (m.id === "bug") throw new TypeError("cannot read properties of undefined"); });
  ok(amb.estado.dlt.length === 1 && amb.estado.dlt[0].tentativas === 10, "desconhecida vai para a DLT após 10 tentativas (atravessando seeks)");
  ok(amb.estado.efeitos.join() === "a,b", "depois segue");
}
// Cenário 4: crash entre processar e commitar -> reentrega -> inbox descarta
{
  const amb = criarAmbiente([{ id: "a" }, { id: "b" }, { id: "c" }], {});
  let chamadas = 0;
  laco(amb, () => { chamadas++; }, { crashAposProcessarOffset: 1 });
  ok(amb.estado.efeitos.join() === "a,b,c" && chamadas === 3, "reentrega de b não repete o efeito (inbox)");
}
// Cenário 5: desconhecida que se resolve sozinha na 3ª tentativa (ex.: deadlock detectado)
{
  const amb = criarAmbiente([{ id: "a" }], {});
  laco(amb, (m, t) => { if (t < 3) throw new Error("deadlock detected"); });
  ok(amb.estado.dlt.length === 0 && amb.estado.efeitos.join() === "a", "desconhecida passageira não vai para a DLT");
}
process.exit(falhas ? 1 : 0);
