// Uso: npm run db:migrar
import { aplicarMigrations } from '../src/db/migracoes.js';

try {
  await aplicarMigrations(process.env.DATABASE_URL_MIGRACAO ?? process.env.DATABASE_URL);
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
}
