// Moldura comum dos comandos npm run db:*: lê a configuração, roda a tarefa e
// transforma erro em mensagem legível + código de saída 1 (o CI entende como falha).
const { ErroScript, lerConfiguracao } = require('./ambiente');
const { ErroSql } = require('./sql');

async function executarComando(titulo, tarefa) {
  const inicio = Date.now();
  try {
    const config = lerConfiguracao();
    console.log(`${titulo}\n${'─'.repeat(titulo.length)}`);
    await tarefa(config);
    console.log(`\nConcluído em ${Date.now() - inicio} ms.`);
  } catch (erro) {
    if (erro instanceof ErroScript || erro instanceof ErroSql) {
      console.error(`\n✖ ${erro.message}`);
    } else {
      // erro inesperado: aqui o stack trace ajuda
      console.error('\n✖ Erro inesperado:', erro);
    }
    process.exitCode = 1;
  }
}

module.exports = { executarComando };
