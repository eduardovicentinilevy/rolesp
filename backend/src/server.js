// Ponto de entrada: sobe o servidor HTTP e encerra com elegância (graceful shutdown).
import { ambiente } from './config/ambiente.js';
import { logger } from './config/logger.js';
import { criarApp } from './app.js';
import { pool } from './db/pool.js';

const servidor = criarApp().listen(ambiente.PORT, () => {
  logger.info({ porta: ambiente.PORT, ambiente: ambiente.NODE_ENV }, 'API do Rolê SP no ar');
});

// O Cloud Run manda SIGTERM antes de desligar a instância: paramos de aceitar conexões,
// esperamos as requisições em andamento e fechamos o pool do banco.
function encerrar(sinal) {
  logger.info({ sinal }, 'encerrando');
  servidor.close(async () => {
    await pool.end();
    process.exit(0);
  });
  // se algo travar, não espera para sempre
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
