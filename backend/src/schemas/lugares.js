// Esquemas de entrada das rotas públicas de lugares.
import { z } from 'zod';
import {
  booleanoNaQuery,
  idioma,
  listaNaQuery,
  paginacao,
  paramSlug,
  queryIdioma,
  slug,
} from './comuns.js';

export const ORDENS = ['relevancia', 'nome', 'nota', 'recentes'];

export const esquemaListagem = {
  query: z
    .object({
      categoria: listaNaQuery(slug).optional(),
      bairro: listaNaQuery(slug).optional(),
      preco: listaNaQuery(z.coerce.number().int().min(1).max(4), 4).optional(),
      tags: listaNaQuery(slug, 10).optional(),
      bairrista: booleanoNaQuery.optional(),
      q: z
        .string()
        .trim()
        .max(100, 'A busca pode ter no máximo 100 caracteres.')
        .optional()
        .transform((texto) => texto || undefined),
      lang: idioma.default('pt'),
      ordem: z.enum(ORDENS).optional(),
      ...paginacao,
    })
    .strict()
    // sem busca não existe "relevância": cai para ordem alfabética
    .transform((filtros) => ({
      ...filtros,
      ordem: filtros.ordem ?? (filtros.q ? 'relevancia' : 'nome'),
    }))
    .transform((filtros) =>
      filtros.ordem === 'relevancia' && !filtros.q ? { ...filtros, ordem: 'nome' } : filtros,
    ),
};

export const esquemaDetalhe = {
  params: paramSlug,
  query: queryIdioma.strict(),
};

export const esquemaDicaDoDia = {
  query: queryIdioma.strict(),
};
