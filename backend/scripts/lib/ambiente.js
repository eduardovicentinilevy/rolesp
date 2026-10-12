// Configuração dos scripts de banco: caminhos e variáveis de ambiente.
const path = require('node:path');

const RAIZ_REPOSITORIO = path.resolve(__dirname, '..', '..', '..');

// Um .env só, na raiz do repositório: o mesmo que o docker compose lê.
// O dotenv não sobrescreve variáveis que já existem, então no CI (ou num terminal com
// DATABASE_URL exportada) vale o que veio de fora.
require('dotenv').config({ path: path.join(RAIZ_REPOSITORIO, '.env'), quiet: true });

const PASTAS = {
  migrations: path.join(RAIZ_REPOSITORIO, 'db', 'migrations'),
  seeds: path.join(RAIZ_REPOSITORIO, 'db', 'seeds'),
  testes: path.join(RAIZ_REPOSITORIO, 'db', 'testes'),
};

// Erro "esperado" de script: a mensagem já explica o que fazer, sem stack trace.
class ErroScript extends Error {}

function lerConfiguracao(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new ErroScript(
      'DATABASE_URL não definida. Copie .env.example para .env na raiz do repositório.',
    );
  }
  return {
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.NODE_ENV || 'development',
  };
}

module.exports = { RAIZ_REPOSITORIO, PASTAS, ErroScript, lerConfiguracao };
