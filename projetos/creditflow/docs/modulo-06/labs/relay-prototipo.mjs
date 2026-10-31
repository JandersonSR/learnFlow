// Protótipo do relay da outbox com faixas + FOR UPDATE SKIP LOCKED (mesmo SQL do OutboxRelay.cs).
// 1 produtor grava eventos (40 chaves, seq por chave) enquanto 4 relays concorrentes publicam.
// Falhas simuladas: 8% de falha de publicação, 3% de "pod morre depois de publicar e antes do COMMIT".
// Verifica: nada perdido; por chave, a 1ª ocorrência de cada seq chega em ordem; duplicatas só por crash.
import pg from "pg";
const cfg = { connectionString: process.env.DATABASE_URL || "postgres://creditflow:creditflow@127.0.0.1:5432/creditflow" };
const S = "pagamentos";
const INGENUO = process.argv[2] === "ingenuo"; // SKIP LOCKED direto nas linhas, sem faixas
const FAIXAS = 16, LOTE = 50, FAIXAS_POR_CICLO = 4, CHAVES = 40, EVENTOS = 2000;
const publicadas = []; // o "Kafka": [{chave, seq, relay}]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fnv1a(s) { let h = 0x811c9dc5; for (const b of Buffer.from(s, "utf8")) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }

const admin = new pg.Client(cfg); await admin.connect();
await admin.query(`TRUNCATE ${S}.outbox`);

async function produtor() {
  const c = new pg.Client(cfg); await c.connect();
  const seq = new Map();
  for (let i = 0; i < EVENTOS; i++) {
    const chave = `proposta-${i % CHAVES}`;
    const n = (seq.get(chave) ?? 0) + 1; seq.set(chave, n);
    await c.query(`INSERT INTO ${S}.outbox (evento_id,tipo,versao,topico,chave,faixa,conteudo,cabecalhos,ocorrido_em,criada_em)
      VALUES (gen_random_uuid(),'Teste',1,'t',$1,$2,$3,'{}',now(),now())`, [chave, fnv1a(chave) % FAIXAS, JSON.stringify({ seq: n })]);
    if (i % 50 === 0) await sleep(5);
  }
  await c.end();
}

let produzindo = true;
async function relay(nome) {
  const c = new pg.Client(cfg); await c.connect();
  let ociosos = 0;
  while (produzindo || ociosos < 5) {
    await c.query("BEGIN");
    let crash = false;
    try {
      let rows;
      if (INGENUO) {
        ({ rows } = await c.query(`SELECT id, chave, conteudo FROM ${S}.outbox WHERE publicada_em IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, [LOTE]));
      } else {
        const { rows: f } = await c.query(`SELECT faixa FROM ${S}.outbox_faixas ORDER BY random() LIMIT $1 FOR UPDATE SKIP LOCKED`, [FAIXAS_POR_CICLO]);
        if (f.length === 0) { await c.query("ROLLBACK"); await sleep(10); continue; }
        ({ rows } = await c.query(`SELECT id, chave, conteudo FROM ${S}.outbox WHERE publicada_em IS NULL AND faixa = ANY($1::smallint[]) ORDER BY id LIMIT $2`,
          [f.map((x) => x.faixa), LOTE]));
      }
      if (rows.length === 0) { ociosos++; await c.query("COMMIT"); await sleep(20); continue; }
      ociosos = 0;
      // agrupa por chave: sequencial dentro da chave, chaves em paralelo
      const grupos = new Map();
      for (const r of rows) (grupos.get(r.chave) ?? grupos.set(r.chave, []).get(r.chave)).push(r);
      const ok = [], falhas = [];
      await Promise.all([...grupos.values()].map(async (g) => {
        for (const r of g) {
          await sleep(Math.random() * 3);
          if (Math.random() < 0.08) { falhas.push(r); return; } // para a chave neste ciclo
          publicadas.push({ chave: r.chave, seq: r.conteudo.seq, relay: nome });
          ok.push(r.id);
        }
      }));
      if (Math.random() < 0.03) { crash = true; throw new Error("pod morreu antes do COMMIT"); }
      if (ok.length) await c.query(`UPDATE ${S}.outbox SET publicada_em = now() WHERE id = ANY($1::bigint[])`, [ok]);
      for (const r of falhas) await c.query(`UPDATE ${S}.outbox SET tentativas = tentativas + 1, ultimo_erro = 'simulado' WHERE id = $1`, [r.id]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      if (!crash) throw e;
    }
  }
  await c.end();
}

const t0 = Date.now();
// "backlog": o relay ficou fora (deploy, queda) e a fila acumulou; é quando os lotes se sobrepõem
if (process.argv.includes("backlog")) { await produtor(); produzindo = false; await Promise.all([relay("A"), relay("B"), relay("C"), relay("D")]); }
else { const relays = [relay("A"), relay("B"), relay("C"), relay("D")]; await produtor(); produzindo = false; await Promise.all(relays); }

const { rows: [p] } = await admin.query(`SELECT count(*) FILTER (WHERE publicada_em IS NULL) AS pendentes, count(*) AS total, sum(tentativas) AS falhas FROM ${S}.outbox`);
const porChave = new Map();
for (const m of publicadas) (porChave.get(m.chave) ?? porChave.set(m.chave, []).get(m.chave)).push(m.seq);
let foraDeOrdem = 0, perdidos = 0, duplicatas = 0;
for (const [, seqs] of porChave) {
  const vistos = new Set(); let ultimo = 0;
  for (const s of seqs) {
    if (vistos.has(s)) { duplicatas++; continue; }  // o inbox do consumidor descartaria
    vistos.add(s);
    if (s !== ultimo + 1) foraDeOrdem++;
    ultimo = s;
  }
  perdidos += EVENTOS / CHAVES - vistos.size;
}
const porRelay = publicadas.reduce((a, m) => ((a[m.relay] = (a[m.relay] ?? 0) + 1), a), {});
console.log({ ms: Date.now() - t0, total: +p.total, pendentes: +p.pendentes, falhasDePublicacao: +p.falhas, entregues: publicadas.length, duplicatas, foraDeOrdem, perdidos, porRelay });
if (+p.pendentes !== 0 || foraDeOrdem !== 0 || perdidos !== 0) { console.error("REPROVADO"); process.exit(1); }
console.log("APROVADO: nada perdido, ordem por chave preservada, duplicatas só por crash");
await admin.end();
