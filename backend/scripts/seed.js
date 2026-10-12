// npm run db:seed — aplica os seeds de db/seeds numa única transação (idempotente)
const { executarComando } = require('./lib/cli');
const { comCliente } = require('./lib/sql');
const { semear } = require('./lib/seeds');

executarComando('Seeds', (config) =>
  comCliente(config.databaseUrl, (cliente) => semear(cliente, { nodeEnv: config.nodeEnv })),
);
