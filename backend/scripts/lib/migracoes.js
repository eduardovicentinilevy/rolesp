// Runner de migrations em SQL puro.
//
// Por que não uma lib (node-pg-migrate, knex)? O projeto quer mostrar o mecanismo:
// arquivos .sql numerados, aplicados em ordem, cada um na sua transação, com nome e
// checksum gravados em schema_migrations. Roda igual no local, no CI e no Cloud Run Job.
const { PASTAS, ErroScript } = require('./ambiente');
const { lerArquivosSql, executarArquivo } = require('./sql');

const PADRAO_MIGRATION = /^\d{3}_[a-z0-9_]+\.sql$/;

// Número fixo e arbitrário do advisory lock. Dois deploys ao mesmo tempo disputam este
// lock; o segundo espera o primeiro terminar e depois encontra tudo já aplicado.
// (O lock vale por banco: rodar em bancos diferentes não trava um ao outro.)
const ID_LOCK_MIGRATIONS = 7_311_024;

const SQL_CRIAR_TABELA = `
  CREATE TABLE schema_migrations (
    nome        text        PRIMARY KEY,
    checksum    char(64)    NOT NULL,
    aplicada_em timestamptz NOT NULL DEFAULT now(),
    duracao_ms  integer     NOT NULL
  )`;

async function lerMigrations(pasta = PASTAS.migrations) {
  const arquivos = await lerArquivosSql(pasta, PADRAO_MIGRATION);
  // dois arquivos com o mesmo número deixariam a ordem ambígua
  const vistos = new Map();
  for (const arquivo of arquivos) {
    const numero = arquivo.nome.slice(0, 3);
    if (vistos.has(numero)) {
      throw new ErroScript(`Migrations com o mesmo número: ${vistos.get(numero)} e ${arquivo.nome}.`);
    }
    vistos.set(numero, arquivo.nome);
  }
  return arquivos;
}

async function lerAplicadas(cliente) {
  const { rows } = await cliente.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS existe",
  );
  if (!rows[0].existe) return null; // banco novo: nada aplicado ainda
  const resultado = await cliente.query(
    'SELECT nome, checksum, aplicada_em FROM schema_migrations ORDER BY nome',
  );
  return resultado.rows;
}

// Compara o que está no repositório com o que está no banco.
// Problemas (qualquer um impede o migrate de rodar):
//   - editada: o arquivo mudou depois de aplicado (o checksum não bate);
//   - ausente: foi aplicada, mas o arquivo sumiu do repositório;
//   - fora_de_ordem: arquivo novo com número menor que o da última aplicada.
function compararMigrations(arquivos, aplicadas) {
  const porNome = new Map(arquivos.map((arquivo) => [arquivo.nome, arquivo]));
  const nomesAplicados = new Set((aplicadas ?? []).map((linha) => linha.nome));
  const ultimaAplicada = (aplicadas ?? []).map((linha) => linha.nome).sort().at(-1);
  const problemas = [];

  for (const linha of aplicadas ?? []) {
    const arquivo = porNome.get(linha.nome);
    if (!arquivo) {
      problemas.push({ tipo: 'ausente', nome: linha.nome });
    } else if (arquivo.checksum !== linha.checksum.trim()) {
      problemas.push({ tipo: 'editada', nome: linha.nome });
    }
  }

  const pendentes = arquivos.filter((arquivo) => !nomesAplicados.has(arquivo.nome));
  for (const arquivo of pendentes) {
    if (ultimaAplicada && arquivo.nome < ultimaAplicada) {
      problemas.push({ tipo: 'fora_de_ordem', nome: arquivo.nome, ultimaAplicada });
    }
  }
  return { pendentes, problemas };
}

const EXPLICACAO_PROBLEMA = {
  editada: (p) => `${p.nome} foi EDITADA depois de aplicada (o checksum não bate).`,
  ausente: (p) => `${p.nome} foi aplicada, mas SUMIU do repositório.`,
  fora_de_ordem: (p) =>
    `${p.nome} é nova, mas tem número menor que a última aplicada (${p.ultimaAplicada}).`,
};

function erroDeProblemas(problemas) {
  const linhas = problemas.map((p) => `  - ${EXPLICACAO_PROBLEMA[p.tipo](p)}`);
  return new ErroScript(
    `Migrations inconsistentes; nada foi aplicado:\n${linhas.join('\n')}\n` +
      'Migration aplicada não se edita: desfaça a alteração e crie uma migration nova (ex.: 008_*.sql).',
  );
}

async function adquirirLock(cliente, log) {
  const { rows } = await cliente.query('SELECT pg_try_advisory_lock($1) AS obtido', [ID_LOCK_MIGRATIONS]);
  if (rows[0].obtido) return;
  log('Outra execução de migrations está em andamento. Aguardando até 60 s...');
  await cliente.query("SET lock_timeout = '60s'");
  try {
    await cliente.query('SELECT pg_advisory_lock($1)', [ID_LOCK_MIGRATIONS]);
  } catch (erro) {
    if (erro.code === '55P03') {
      throw new ErroScript('A outra execução de migrations não terminou em 60 s. Tente de novo depois.');
    }
    throw erro;
  } finally {
    await cliente.query('RESET lock_timeout');
  }
}

// Aplica as migrations pendentes. Devolve os nomes aplicados.
async function migrar(cliente, { log = console.log, pasta } = {}) {
  await adquirirLock(cliente, log);
  try {
    // Leitura e comparação DEPOIS do lock: assim enxergamos o que a outra execução aplicou
    const arquivos = await lerMigrations(pasta);
    let aplicadas = await lerAplicadas(cliente);
    if (aplicadas === null) {
      // banco novo: cria a tabela de controle (checar antes evita o NOTICE do IF NOT EXISTS)
      await cliente.query(SQL_CRIAR_TABELA);
      aplicadas = [];
    }
    const { pendentes, problemas } = compararMigrations(arquivos, aplicadas);
    if (problemas.length > 0) throw erroDeProblemas(problemas);
    if (pendentes.length === 0) {
      log('Nenhuma migration pendente.');
      return [];
    }

    for (const arquivo of pendentes) {
      const inicio = Date.now();
      // Uma transação por migration: se falhar no meio, nada dela fica no banco
      // (no Postgres, até CREATE TABLE e CREATE INDEX respeitam o ROLLBACK).
      await cliente.query('BEGIN');
      try {
        await executarArquivo(cliente, arquivo);
        await cliente.query(
          'INSERT INTO schema_migrations (nome, checksum, duracao_ms) VALUES ($1, $2, $3)',
          [arquivo.nome, arquivo.checksum, Date.now() - inicio],
        );
        await cliente.query('COMMIT');
      } catch (erro) {
        await cliente.query('ROLLBACK');
        throw erro;
      }
      log(`✔ ${arquivo.nome} (${Date.now() - inicio} ms)`);
    }
    return pendentes.map((arquivo) => arquivo.nome);
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1)', [ID_LOCK_MIGRATIONS]);
  }
}

// Situação de cada migration, sem alterar nada.
async function statusMigrations(cliente, { pasta } = {}) {
  const arquivos = await lerMigrations(pasta);
  const aplicadas = await lerAplicadas(cliente);
  const { pendentes, problemas } = compararMigrations(arquivos, aplicadas);
  const problemaPorNome = new Map(problemas.map((p) => [p.nome, p]));
  const pendentesPorNome = new Set(pendentes.map((arquivo) => arquivo.nome));
  const aplicadaPorNome = new Map((aplicadas ?? []).map((linha) => [linha.nome, linha]));

  const nomes = [...new Set([...arquivos.map((a) => a.nome), ...aplicadaPorNome.keys()])].sort();
  const itens = nomes.map((nome) => {
    const problema = problemaPorNome.get(nome);
    if (problema) return { nome, situacao: problema.tipo };
    if (pendentesPorNome.has(nome)) return { nome, situacao: 'pendente' };
    return { nome, situacao: 'aplicada', aplicadaEm: aplicadaPorNome.get(nome).aplicada_em };
  });
  return { itens, pendentes: pendentes.length, problemas };
}

module.exports = {
  PADRAO_MIGRATION,
  lerMigrations,
  compararMigrations,
  migrar,
  statusMigrations,
  erroDeProblemas,
  lerAplicadas,
};
