// db:reset: apaga o schema inteiro e recria do zero (migrate + seed).
// É destrutivo, então tem duas travas: nunca em produção e só em banco local.
const { ErroScript } = require('./ambiente');
const { migrar } = require('./migracoes');
const { semear } = require('./seeds');

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// Lê o host do DATABASE_URL. Sem host na URL, o driver usa o socket local (também conta como local).
function lerAlvo(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new ErroScript('DATABASE_URL inválida (esperado postgres://usuario:senha@host:porta/banco).');
  }
  const hostSocket = url.searchParams.get('host');
  const host = url.hostname || hostSocket || '';
  const banco = decodeURIComponent(url.pathname.replace(/^\//, '')) || '(padrão)';
  // "/var/run/postgresql": socket Unix, só existe na própria máquina
  const local = host === '' || host.startsWith('/') || HOSTS_LOCAIS.has(host);
  return { host: host || 'socket local', banco, local };
}

function conferirTravas(databaseUrl, nodeEnv) {
  if (nodeEnv === 'production') {
    throw new ErroScript('db:reset recusado: NODE_ENV=production. Este comando apaga todos os dados.');
  }
  const alvo = lerAlvo(databaseUrl);
  if (!alvo.local) {
    throw new ErroScript(
      `db:reset recusado: o host "${alvo.host}" não é local. ` +
        'O reset só roda em localhost, 127.0.0.1, ::1 ou socket local.',
    );
  }
  return alvo;
}

async function resetar(cliente, { databaseUrl, nodeEnv = 'development', log = console.log } = {}) {
  const alvo = conferirTravas(databaseUrl, nodeEnv);
  log(`Apagando o schema public do banco "${alvo.banco}" (${alvo.host})...`);
  // DROP SCHEMA ... CASCADE leva tudo junto: tabelas, views, funções, domínios, collation,
  // configurações de busca e a extensão unaccent (que mora no schema public).
  // Depois o schema é recriado como o Postgres 15+ cria por padrão: dono pg_database_owner
  // (o dono do banco) e USAGE para todos.
  await cliente.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public AUTHORIZATION pg_database_owner;
    GRANT USAGE ON SCHEMA public TO PUBLIC;
  `);
  log('\nMigrations:');
  const migrations = await migrar(cliente, { log });
  log('\nSeeds:');
  const seeds = await semear(cliente, { nodeEnv, log });
  return { migrations, seeds };
}

module.exports = { resetar, lerAlvo, conferirTravas };
