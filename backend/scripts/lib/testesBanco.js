// db:test: roda db/testes/constraints.sql pelo Node, sem precisar do psql
// (que normalmente não vem instalado no Windows). Os RAISE NOTICE aparecem no terminal.
const path = require('node:path');
const fs = require('node:fs/promises');
const { PASTAS, ErroScript } = require('./ambiente');
const { executarArquivo, calcularChecksum } = require('./sql');
const { lerAplicadas } = require('./migracoes');

async function testarBanco(cliente, { arquivo = path.join(PASTAS.testes, 'constraints.sql') } = {}) {
  const aplicadas = await lerAplicadas(cliente);
  if (aplicadas === null || aplicadas.length === 0) {
    throw new ErroScript('O schema ainda não existe neste banco. Rode "npm run db:migrate" antes.');
  }
  const conteudo = await fs.readFile(arquivo, 'utf8');
  try {
    // O arquivo abre e fecha a própria transação (BEGIN ... ROLLBACK)
    await executarArquivo(cliente, { nome: path.basename(arquivo), conteudo, checksum: calcularChecksum(conteudo) });
  } catch (erro) {
    // Um teste falhou no meio: a transação ficou abortada. Desfaz tudo antes de sair.
    // (Se o arquivo esquecesse o ROLLBACK, fechar a conexão sem COMMIT também desfaria.)
    await cliente.query('ROLLBACK').catch(() => {});
    throw erro;
  }
}

module.exports = { testarBanco };
