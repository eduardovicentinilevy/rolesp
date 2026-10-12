// npm run db:migrate — aplica as migrations pendentes de db/migrations
const { executarComando } = require('./lib/cli');
const { comCliente } = require('./lib/sql');
const { migrar } = require('./lib/migracoes');

executarComando('Migrations', (config) =>
  comCliente(config.databaseUrl, (cliente) => migrar(cliente)),
);
