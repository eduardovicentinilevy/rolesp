// Uso: npm run db:resetar — apaga tudo e reaplica migrations e seeds (só desenvolvimento).
import { aplicarMigrations, aplicarSeeds, resetarBanco } from '../src/db/migracoes.js';

const url = process.env.DATABASE_URL_MIGRACAO ?? process.env.DATABASE_URL;
try {
  await resetarBanco(url);
  await aplicarMigrations(url);
  await aplicarSeeds(url);
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
}
