// npm run db:test — roda db/testes/constraints.sql e mostra os RAISE NOTICE
const { executarComando } = require('./lib/cli');
const { comCliente } = require('./lib/sql');
const { testarBanco } = require('./lib/testesBanco');

executarComando('Testes do banco (db/testes/constraints.sql)', (config) =>
  comCliente(config.databaseUrl, (cliente) => testarBanco(cliente)),
);
