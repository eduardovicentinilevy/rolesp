// API dos scripts de banco, para reaproveitar fora da linha de comando
// (ex.: o globalSetup do Jest, na fase 3, faz o reset do banco de testes com isto).
// Cada função abre a própria conexão a partir de uma DATABASE_URL.
const { comCliente } = require('./sql');
const { migrar, statusMigrations } = require('./migracoes');
const { semear } = require('./seeds');
const { resetar } = require('./reset');
const { testarBanco } = require('./testesBanco');

const silencioso = () => {};

module.exports = {
  aplicarMigrations: (databaseUrl, { log = silencioso } = {}) =>
    comCliente(databaseUrl, (cliente) => migrar(cliente, { log }), { log }),
  lerStatusMigrations: (databaseUrl) =>
    comCliente(databaseUrl, (cliente) => statusMigrations(cliente)),
  aplicarSeeds: (databaseUrl, { nodeEnv, log = silencioso } = {}) =>
    comCliente(databaseUrl, (cliente) => semear(cliente, { nodeEnv, log }), { log }),
  resetarBanco: (databaseUrl, { nodeEnv, log = silencioso } = {}) =>
    comCliente(databaseUrl, (cliente) => resetar(cliente, { databaseUrl, nodeEnv, log }), { log }),
  testarBanco: (databaseUrl, { log = console.log } = {}) =>
    comCliente(databaseUrl, (cliente) => testarBanco(cliente), { log }),
};
