// Inbox: dois consumidores recebem o MESMO evento ao mesmo tempo (rebalanceamento, reentrega).
// Cada um: BEGIN; INSERT inbox ON CONFLICT DO NOTHING; se inseriu, aplica o efeito; COMMIT.
// Esperado: o efeito acontece exatamente uma vez; o segundo espera o primeiro (trava da chave única) e vê 0 linhas.
import pg from "pg";
const cfg = { connectionString: process.env.DATABASE_URL || "postgres://creditflow:creditflow@127.0.0.1:5432/creditflow" };
const admin = new pg.Client(cfg); await admin.connect();
await admin.query("DROP TABLE IF EXISTS pagamentos.efeito_teste; CREATE TABLE pagamentos.efeito_teste (n int)");
await admin.query("INSERT INTO pagamentos.efeito_teste VALUES (0)");
const evento = (await admin.query("SELECT gen_random_uuid() AS id")).rows[0].id;
const log = [];
async function consumir(nome, atrasoAntesDoCommit, falhaNoMeio = false) {
  const c = new pg.Client(cfg); await c.connect();
  await c.query("BEGIN");
  const t = Date.now();
  const r = await c.query(`INSERT INTO pagamentos.inbox (consumidor, evento_id, tipo, processada_em)
     VALUES ('pagamentos', $1, 'ContratoAssinado', now()) ON CONFLICT DO NOTHING`, [evento]);
  log.push(`${nome}: INSERT inbox -> ${r.rowCount} linha(s) após ${Date.now() - t} ms`);
  if (r.rowCount === 0) { await c.query("ROLLBACK"); log.push(`${nome}: duplicata, ignora e confirma offset`); return c.end(); }
  await c.query("UPDATE pagamentos.efeito_teste SET n = n + 1");
  await new Promise((s) => setTimeout(s, atrasoAntesDoCommit));
  if (falhaNoMeio) { await c.query("ROLLBACK"); log.push(`${nome}: falhou antes do COMMIT (rollback desfaz inbox E efeito)`); return c.end(); }
  await c.query("COMMIT"); log.push(`${nome}: COMMIT`); await c.end();
}
// cenário 1: concorrência
await Promise.all([consumir("pod-1", 300), new Promise((r) => setTimeout(r, 50)).then(() => consumir("pod-2", 0))]);
// cenário 2: reentrega depois de um crash no meio: o 1º falha, o 2º (reentrega) precisa aplicar
const evento2 = (await admin.query("SELECT gen_random_uuid() AS id")).rows[0].id;
const ev1 = evento;
await admin.query("UPDATE pagamentos.efeito_teste SET n = 0");
await admin.query("DELETE FROM pagamentos.inbox");
log.push("--- cenário 2: crash antes do COMMIT, depois reentrega");
await consumir("pod-1", 0, true); await consumir("pod-2", 0);
const n = (await admin.query("SELECT n FROM pagamentos.efeito_teste")).rows[0].n;
console.log(log.join("\n")); console.log("efeito aplicado (cenário 2):", n);
await admin.end();
