// Roda uma vez antes de toda a suíte: apaga o banco de TESTE e reaplica as migrations.
import { aplicarMigrations, resetarBanco } from '../../src/db/migracoes.js';

export default async function prepararBanco() {
  const url = process.env.DATABASE_URL_MIGRACAO;
  if (!url) throw new Error('Defina DATABASE_URL_MIGRACAO no .env.test');

  // Trava de segurança: nunca apagar um banco que não seja de teste
  const nomeDoBanco = new URL(url).pathname.slice(1);
  if (!nomeDoBanco.includes('test')) {
    throw new Error(`Os testes apagam o banco; "${nomeDoBanco}" não parece ser um banco de teste.`);
  }

  const silencioso = { log: () => {} };
  await resetarBanco(url, silencioso);
  await aplicarMigrations(url, silencioso);
}
