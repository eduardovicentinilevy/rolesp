// Executa uma função dentro de uma transação: tudo ou nada.
//
// Os repositories recebem um "executor" (o pool ou o client da transação), então a mesma
// função de repository funciona dentro e fora de transação sem duplicar SQL.
import { pool as poolPadrao } from './pool.js';

export async function comTransacao(funcao, { pool = poolPadrao } = {}) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await funcao(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro; // o middleware de erros decide o status HTTP
  } finally {
    cliente.release(); // devolve a conexão ao pool mesmo se der erro
  }
}
