// Uso: npm run db:seed (depois de npm run db:migrar)
import { aplicarSeeds } from '../src/db/migracoes.js';

try {
  await aplicarSeeds(process.env.DATABASE_URL_MIGRACAO ?? process.env.DATABASE_URL);
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
}
