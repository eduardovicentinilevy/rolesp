// Peças de validação reaproveitadas pelos esquemas de cada recurso.
import { z } from 'zod';
import { IDIOMA_PADRAO, IDIOMAS } from '../config/ambiente.js';

// Mensagens do zod em português
z.config(z.locales.pt());

export const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(140)
  .regex(FORMATO_SLUG, 'Use só letras minúsculas, números e hífens.');

export const idioma = z.enum(IDIOMAS, { message: `Idioma deve ser um destes: ${IDIOMAS.join(', ')}.` });

export const queryIdioma = z.object({ lang: idioma.default(IDIOMA_PADRAO) });

export const paramSlug = z.object({ slug });

export const paramId = z.object({
  id: z.coerce.number().int().positive().max(2_147_483_647),
});

export const paginacao = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

// "a,b,b" -> ["a", "b"] (lista separada por vírgula na query string, sem repetidos)
export const listaNaQuery = (item, maximo = 20) =>
  z
    // aceita "?tags=a,b" e também "?tags=a&tags=b" (que chega como array)
    .union([z.string(), z.array(z.string())])
    .transform((valor) => (Array.isArray(valor) ? valor.join(',') : valor))
    .transform((valor) => [
      ...new Set(
        valor
          .split(',')
          .map((parte) => parte.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(item).max(maximo));

// Query string só tem texto: "true"/"false" precisam virar boolean
export const booleanoNaQuery = z.enum(['true', 'false']).transform((valor) => valor === 'true');

// Texto opcional: "" ou só espaços vira null
export const textoOpcional = (maximo) =>
  z
    .string()
    .trim()
    .max(maximo)
    .nullish()
    .transform((valor) => (valor ? valor : null));

// URL http(s). Bloqueia "javascript:", "data:" e outros esquemas perigosos.
export const urlHttp = z
  .url({ protocol: /^https?$/, message: 'Informe uma URL começando com http:// ou https://' })
  .max(300);

export const urlHttps = z
  .url({ protocol: /^https$/, message: 'Informe uma URL começando com https://' })
  .max(500);
