// Pool de conexões único da API. Conecta com o papel rolesp_app (só DML).
import pg from 'pg';
import { ambiente } from '../config/ambiente.js';
import { logger } from '../config/logger.js';

export const pool = new pg.Pool({
  connectionString: ambiente.DATABASE_URL,
  max: ambiente.DB_POOL_MAX,
  statement_timeout: ambiente.DB_STATEMENT_TIMEOUT_MS,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Sem este listener, um erro numa conexão ociosa (ex.: banco reiniciou) derrubaria o processo
pool.on('error', (erro) => {
  logger.error({ err: erro }, 'erro inesperado numa conexão ociosa do pool');
});
