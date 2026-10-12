// npm run db:status — mostra a situação de cada migration, sem alterar nada
const { executarComando } = require('./lib/cli');
const { ErroScript } = require('./lib/ambiente');
const { comCliente } = require('./lib/sql');
const { statusMigrations } = require('./lib/migracoes');

const SIMBOLO = {
  aplicada: '✔',
  pendente: '…',
  editada: '✖ EDITADA depois de aplicada',
  ausente: '✖ AUSENTE do repositório',
  fora_de_ordem: '✖ FORA DE ORDEM',
};

const formatarData = (data) =>
  data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' });

executarComando('Status das migrations', (config) =>
  comCliente(config.databaseUrl, async (cliente) => {
    const { itens, pendentes, problemas } = await statusMigrations(cliente);
    for (const item of itens) {
      const quando = item.aplicadaEm ? `  aplicada em ${formatarData(item.aplicadaEm)}` : '';
      const situacao = item.situacao === 'pendente' ? '  pendente' : '';
      console.log(`${SIMBOLO[item.situacao].padEnd(2)} ${item.nome}${situacao}${quando}`);
    }
    console.log(`\n${itens.length} migration(s), ${pendentes} pendente(s), ${problemas.length} problema(s).`);
    if (problemas.length > 0) {
      throw new ErroScript('Há migrations inconsistentes. Migration aplicada não se edita: crie uma nova.');
    }
  }),
);
