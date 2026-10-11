// Runner próprio de migrations e seeds em SQL puro.
//
// Por que não usar uma lib (node-pg-migrate, knex)? O projeto quer mostrar o mecanismo:
// arquivos .sql numerados, aplicados em ordem, cada um numa transação, com o histórico
// gravado na tabela schema_migrations. Roda igual no local, no CI e no Cloud Run (Job).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const RAIZ_DB = fileURLToPath(new URL('../../../db/', import.meta.url));
export const PASTA_MIGRATIONS = path.join(RAIZ_DB, 'migrations');
export const PASTA_SEEDS = path.join(RAIZ_DB, 'seeds');

// Número arbitrário e fixo do advisory lock: impede que dois deploys simultâneos
// apliquem a mesma migration ao mesmo tempo.
const ID_LOCK_MIGRACOES = 7_311_024;

const PADRAO_ARQUIVO = /^\d{3}_[a-z0-9_]+\.sql$/;

async function listarArquivosSql(pasta) {
  const arquivos = await readdir(pasta);
  return arquivos.filter((arquivo) => PADRAO_ARQUIVO.test(arquivo)).sort();
}

async function comCliente(connectionString, funcao) {
  if (!connectionString) {
    throw new Error('Defina DATABASE_URL_MIGRACAO (ou DATABASE_URL) para acessar o banco.');
  }
  const cliente = new pg.Client({ connectionString });
  await cliente.connect();
  try {
    return await funcao(cliente);
  } finally {
    await cliente.end();
  }
}

// Executa um arquivo SQL inteiro dentro de uma transação. Sem parâmetros, o driver usa o
// protocolo "simple query", que aceita vários comandos separados por ";".
async function executarArquivoEmTransacao(cliente, caminho, aposExecutar) {
  const sql = await readFile(caminho, 'utf8');
  await cliente.query('BEGIN');
  try {
    await cliente.query(sql);
    if (aposExecutar) await aposExecutar();
    await cliente.query('COMMIT');
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw new Error(`Falha em ${path.basename(caminho)}: ${erro.message}`, { cause: erro });
  }
}

export async function aplicarMigrations(connectionString, { log = console.log } = {}) {
  return comCliente(connectionString, async (cliente) => {
    await cliente.query('SELECT pg_advisory_lock($1)', [ID_LOCK_MIGRACOES]);
    try {
      await cliente.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          versao      varchar(255) PRIMARY KEY,
          aplicada_em timestamptz  NOT NULL DEFAULT now()
        )`);
      const { rows } = await cliente.query('SELECT versao FROM schema_migrations');
      const jaAplicadas = new Set(rows.map((linha) => linha.versao));
      const pendentes = (await listarArquivosSql(PASTA_MIGRATIONS)).filter(
        (arquivo) => !jaAplicadas.has(arquivo),
      );

      for (const arquivo of pendentes) {
        await executarArquivoEmTransacao(cliente, path.join(PASTA_MIGRATIONS, arquivo), () =>
          cliente.query('INSERT INTO schema_migrations (versao) VALUES ($1)', [arquivo]),
        );
        log(`migration aplicada: ${arquivo}`);
      }
      if (pendentes.length === 0) log('nenhuma migration pendente');
      return pendentes;
    } finally {
      await cliente.query('SELECT pg_advisory_unlock($1)', [ID_LOCK_MIGRACOES]);
    }
  });
}

// Seeds são idempotentes (ON CONFLICT DO NOTHING), então podem rodar quantas vezes for preciso.
export async function aplicarSeeds(connectionString, { log = console.log } = {}) {
  return comCliente(connectionString, async (cliente) => {
    const arquivos = await listarArquivosSql(PASTA_SEEDS);
    for (const arquivo of arquivos) {
      await executarArquivoEmTransacao(cliente, path.join(PASTA_SEEDS, arquivo));
      log(`seed aplicado: ${arquivo}`);
    }
    return arquivos;
  });
}

// Apaga TUDO o que pertence ao usuário conectado (tabelas, views, funções, extensões e
// privilégios padrão). Só para desenvolvimento e testes.
export async function resetarBanco(connectionString, { log = console.log } = {}) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('resetarBanco é proibido em produção.');
  }
  return comCliente(connectionString, async (cliente) => {
    await cliente.query('DROP OWNED BY CURRENT_USER CASCADE');
    log('banco resetado');
  });
}
