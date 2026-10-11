// Utilitários de texto: slug e limpeza de texto livre vindo de visitantes.
import { filterXSS } from 'xss';

// "Pastel da Maria — Feira!" -> "pastel-da-maria-feira"
export function gerarSlug(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
    .replace(/-+$/g, '');
}

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decodificarEntidades = (texto) =>
  texto.replace(/&(amp|lt|gt|quot|#39);/g, (entidade) => ENTIDADES[entidade]);

// Caracteres de controle (exceto quebra de linha e tab) não têm motivo para estar num comentário
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// Pela especificação do HTML, uma tag só começa com "<" seguido de letra, "/", "!" ou "?".
// Qualquer outro "<" é texto ("nota < 5") e é escapado antes, para a biblioteca não confundi-lo
// com uma tag e apagar o trecho.
const MENOR_SOLTO = /<(?![a-zA-Z/!?])/g;
const INICIO_DE_TAG = /<(?=[a-zA-Z/!?])/g;

const removerTags = (texto) =>
  filterXSS(texto.replace(MENOR_SOLTO, '&lt;'), {
    whiteList: {}, // nenhuma tag é permitida
    stripIgnoreTag: true, // tags fora da lista são removidas (não escapadas)
  });

// Transforma qualquer entrada em TEXTO PURO, sem nenhuma tag HTML.
//
// Guardamos texto puro (o React escapa na hora de exibir), então, depois de remover as tags,
// decodificamos as entidades de volta ("&amp;" vira "&"). Repetimos até estabilizar, porque
// "&lt;script&gt;" decodificado vira "<script>", que precisa ser removido de novo.
// Garantia final: nenhum "<" seguido de letra sobrevive, nem em entradas patológicas.
export function limparTextoLivre(texto) {
  let atual = texto.normalize('NFC').replace(CONTROLE, '');
  for (let rodada = 0; rodada < 5; rodada += 1) {
    const limpo = decodificarEntidades(removerTags(atual));
    if (limpo === atual) break;
    atual = limpo;
  }
  return atual
    .replace(INICIO_DE_TAG, '')
    .replace(/[ \t]+/g, ' ') // espaços repetidos
    .replace(/\n{3,}/g, '\n\n') // no máximo uma linha em branco
    .trim();
}
