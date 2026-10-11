// Lê e valida as variáveis de ambiente uma única vez, na inicialização.
// "Fail fast": se faltar um segredo ou ele for fraco, a API nem sobe.
import { z } from 'zod';

export const IDIOMAS = ['pt', 'en', 'de', 'fr'];
export const IDIOMA_PADRAO = 'pt';

const esquemaAmbiente = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.string().min(1, 'é obrigatória'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  // uma query lenta não pode prender uma conexão do pool para sempre
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  JWT_SECRET: z.string().min(32, 'precisa ter pelo menos 32 caracteres'),
  JWT_EXPIRACAO_MINUTOS: z.coerce.number().int().positive().max(1440).default(120),
  CORS_ORIGENS: z
    .string()
    .default('http://localhost:5173')
    .transform((valor) =>
      valor
        .split(',')
        .map((origem) => origem.trim())
        .filter(Boolean),
    ),
  // número de proxies confiáveis na frente da API (Google Front End, Firebase Hosting)
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // cookie Secure (só HTTPS). Padrão: ligado em produção
  COOKIE_SECURE: z.stringbool().optional(),
});

export function carregarAmbiente(variaveis = process.env) {
  const resultado = esquemaAmbiente.safeParse(variaveis);
  if (!resultado.success) {
    // Nunca imprime os valores, só os nomes das variáveis com problema
    const problemas = resultado.error.issues
      .map((problema) => `  - ${problema.path.join('.')}: ${problema.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${problemas}`);
  }
  const ambiente = resultado.data;
  return Object.freeze({
    ...ambiente,
    COOKIE_SECURE: ambiente.COOKIE_SECURE ?? ambiente.NODE_ENV === 'production',
    emProducao: ambiente.NODE_ENV === 'production',
  });
}

export const ambiente = carregarAmbiente();
