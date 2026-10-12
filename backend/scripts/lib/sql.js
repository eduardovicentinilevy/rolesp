// Leitura de arquivos .sql, checksum e execução com erro apontando arquivo e linha.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const pg = require('pg');
const { ErroScript, RAIZ_REPOSITORIO } = require('./ambiente');

// Abre uma conexão, executa a função e sempre fecha a conexão no fim.
// Os RAISE NOTICE do banco chegam como evento "notice" e vão para o log.
async function comCliente(databaseUrl, funcao, { log = console.log } = {}) {
  const cliente = new pg.Client({ connectionString: databaseUrl, application_name: 'rolesp-scripts' });
  cliente.on('notice', (aviso) => log(aviso.message));
  try {
    await cliente.connect();
  } catch (erro) {
    throw new ErroScript(
      `Não consegui conectar no banco (${erro.code || erro.message}). ` +
        'O container está no ar? Rode "docker compose up -d" na raiz do repositório.',
    );
  }
  try {
    return await funcao(cliente);
  } finally {
    await cliente.end();
  }
}

// SHA-256 do conteúdo. As quebras de linha são normalizadas para LF antes do cálculo:
// o mesmo arquivo salvo no Windows (CRLF) e no Linux (LF) precisa dar o mesmo checksum.
function calcularChecksum(conteudo) {
  const normalizado = conteudo.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalizado, 'utf8').digest('hex');
}

// Lista os .sql de uma pasta, em ordem. Arquivo .sql fora do padrão é erro, e não é
// ignorado em silêncio: "8_nova.sql" pulada sem aviso seria um bug difícil de achar.
async function lerArquivosSql(pasta, padrao) {
  let nomes;
  try {
    nomes = await fs.readdir(pasta);
  } catch (erro) {
    if (erro.code === 'ENOENT') return [];
    throw erro;
  }
  const sqls = nomes.filter((nome) => nome.endsWith('.sql')).sort();
  const foraDoPadrao = sqls.filter((nome) => !padrao.test(nome));
  if (foraDoPadrao.length > 0) {
    const relativa = path.relative(RAIZ_REPOSITORIO, pasta);
    const exibida = relativa.startsWith('..') ? pasta : relativa;
    throw new ErroScript(
      `Arquivo(s) fora do padrão em ${exibida}: ${foraDoPadrao.join(', ')}. ` +
        'Use 000_nome_em_snake_case.sql.',
    );
  }
  return Promise.all(
    sqls.map(async (nome) => {
      const caminho = path.join(pasta, nome);
      const conteudo = await fs.readFile(caminho, 'utf8');
      return { nome, caminho, conteudo, checksum: calcularChecksum(conteudo) };
    }),
  );
}

// Converte a posição do erro (caractere, contando de 1) em linha e coluna do arquivo.
function localizar(conteudo, posicao) {
  const antes = conteudo.slice(0, posicao - 1);
  const linhas = antes.split('\n');
  const linha = linhas.length;
  const coluna = linhas[linhas.length - 1].length + 1;
  const textoDaLinha = conteudo.split('\n')[linha - 1] ?? '';
  return { linha, coluna, textoDaLinha };
}

// Erro de SQL com contexto: arquivo, linha, coluna e os campos úteis do Postgres.
class ErroSql extends Error {
  constructor(arquivo, conteudo, erroPg) {
    const partes = [];
    let onde = arquivo;
    // position: onde o parser parou, dentro do texto que mandamos
    if (erroPg.position) {
      const { linha, coluna, textoDaLinha } = localizar(conteudo, Number(erroPg.position));
      onde = `${arquivo}:${linha}:${coluna}`;
      partes.push(`    ${linha} | ${textoDaLinha}`);
      partes.push(`    ${' '.repeat(String(linha).length)} | ${' '.repeat(coluna - 1)}^`);
    }
    if (erroPg.detail) partes.push(`  detalhe: ${erroPg.detail}`);
    if (erroPg.hint) partes.push(`  dica: ${erroPg.hint}`);
    // where: erro dentro de função ou bloco DO (ex.: "PL/pgSQL function inline_code_block line 12")
    if (erroPg.where) partes.push(`  contexto: ${erroPg.where}`);
    if (erroPg.constraint) partes.push(`  constraint: ${erroPg.constraint}`);
    if (erroPg.code) partes.push(`  código: ${erroPg.code}`);
    super(`${onde}: ${erroPg.message}${partes.length ? `\n${partes.join('\n')}` : ''}`);
    this.name = 'ErroSql';
    this.arquivo = arquivo;
    this.erroPg = erroPg;
  }
}

// Executa o conteúdo inteiro de um arquivo. Sem parâmetros, o driver usa o protocolo
// "simple query", que aceita vários comandos separados por ";" numa chamada só.
async function executarArquivo(cliente, arquivo) {
  try {
    await cliente.query(arquivo.conteudo);
  } catch (erro) {
    if (erro instanceof pg.DatabaseError) throw new ErroSql(arquivo.nome, arquivo.conteudo, erro);
    throw erro;
  }
}

module.exports = { comCliente, calcularChecksum, lerArquivosSql, localizar, executarArquivo, ErroSql };
