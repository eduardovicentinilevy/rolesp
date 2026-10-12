// Seeds: dados iniciais em SQL, idempotentes (ON CONFLICT DO NOTHING / NOT EXISTS).
const { PASTAS, ErroScript } = require('./ambiente');
const { lerArquivosSql, executarArquivo } = require('./sql');
const { lerMigrations, lerAplicadas, compararMigrations, erroDeProblemas } = require('./migracoes');

// 001_nome.sql roda em qualquer ambiente; 900_nome.dev.sql só fora de produção
const PADRAO_SEED = /^\d{3}_[a-z0-9_]+(\.dev)?\.sql$/;

function ehSeedDeDesenvolvimento(nome) {
  return nome.endsWith('.dev.sql');
}

// O seed só faz sentido com o schema completo: confere antes de abrir a transação
async function conferirSchema(cliente) {
  const aplicadas = await lerAplicadas(cliente);
  if (aplicadas === null || aplicadas.length === 0) {
    throw new ErroScript('O schema ainda não existe neste banco. Rode "npm run db:migrate" antes do seed.');
  }
  const { pendentes, problemas } = compararMigrations(await lerMigrations(), aplicadas);
  if (problemas.length > 0) throw erroDeProblemas(problemas);
  if (pendentes.length > 0) {
    throw new ErroScript(
      `Há ${pendentes.length} migration(s) pendente(s) (${pendentes.map((a) => a.nome).join(', ')}). ` +
        'Rode "npm run db:migrate" antes do seed.',
    );
  }
}

// Roda todos os seeds numa ÚNICA transação: ou entram todos, ou nenhum.
// Se o 999_conferencia achar um problema, os dados dos seeds anteriores também voltam.
async function semear(cliente, { nodeEnv = 'development', log = console.log, pasta = PASTAS.seeds } = {}) {
  await conferirSchema(cliente);
  const arquivos = await lerArquivosSql(pasta, PADRAO_SEED);
  const emProducao = nodeEnv === 'production';
  const aplicar = arquivos.filter((arquivo) => !(emProducao && ehSeedDeDesenvolvimento(arquivo.nome)));
  for (const arquivo of arquivos) {
    if (!aplicar.includes(arquivo)) log(`– ${arquivo.nome} (pulado: NODE_ENV=production)`);
  }

  await cliente.query('BEGIN');
  try {
    for (const arquivo of aplicar) {
      const inicio = Date.now();
      await executarArquivo(cliente, arquivo);
      log(`✔ ${arquivo.nome} (${Date.now() - inicio} ms)`);
    }
    await cliente.query('COMMIT');
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  }
  return aplicar.map((arquivo) => arquivo.nome);
}

module.exports = { PADRAO_SEED, semear, ehSeedDeDesenvolvimento };
