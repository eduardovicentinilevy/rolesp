// Regras de negócio da leitura pública de lugares.
import * as lugaresRepository from '../repositories/lugaresRepository.js';
import { calcularPaginacao } from '../utils/consulta.js';
import { erros } from '../utils/erros.js';
import { mapearLugarDetalhe, mapearLugarResumo } from './mapeadores.js';

export async function listar(filtros) {
  const { linhas, total } = await lugaresRepository.listar(filtros);
  return {
    dados: linhas.map(mapearLugarResumo),
    paginacao: calcularPaginacao({ pagina: filtros.page, limite: filtros.limit }, total),
  };
}

export async function detalhar(slug, idioma) {
  const linha = await lugaresRepository.buscarPorSlug(slug, idioma);
  if (!linha) throw erros.naoEncontrado('Lugar');
  return { dados: mapearLugarDetalhe(linha) };
}

export async function dicaDoDia(idioma) {
  const linha = await lugaresRepository.dicaDoDia(idioma);
  if (!linha) return { dados: null }; // nenhum lugar bairrista com dica: o front mostra o estado vazio
  return {
    dados: {
      data: linha.data,
      dica_local: linha.dica_local,
      idioma_conteudo: linha.idioma_conteudo,
      lugar: {
        slug: linha.slug,
        nome: linha.nome,
        imagem_url: linha.imagem_url,
        imagem_alt: linha.imagem_alt,
        is_bairrista: linha.is_bairrista,
        verificado: linha.verificado,
        categoria: {
          slug: linha.categoria_slug,
          nome: linha.categoria_nome,
          icone: linha.categoria_icone,
        },
        bairro: { slug: linha.bairro_slug, nome: linha.bairro_nome },
      },
    },
  };
}
