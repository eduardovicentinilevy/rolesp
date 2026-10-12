// npm run db:reset — apaga o schema e recria tudo (migrate + seed). Só em banco local.
const { executarComando } = require('./lib/cli');
const { comCliente } = require('./lib/sql');
const { resetar, conferirTravas } = require('./lib/reset');

executarComando('Reset do banco', async (config) => {
  // as travas rodam antes de conectar: em produção nem chega a abrir conexão
  conferirTravas(config.databaseUrl, config.nodeEnv);
  await comCliente(config.databaseUrl, (cliente) =>
    resetar(cliente, { databaseUrl: config.databaseUrl, nodeEnv: config.nodeEnv }),
  );
});
