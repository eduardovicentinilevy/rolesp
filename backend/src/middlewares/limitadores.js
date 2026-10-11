// Rate limit por IP (express-rate-limit).
// Os contadores ficam em memória: cada instância do Cloud Run conta separado. Para este
// projeto (poucas instâncias) é suficiente; num sistema maior o store seria Redis.
// O bloqueio por conta no login fica no banco e, esse sim, vale para todas as instâncias.
import { rateLimit } from 'express-rate-limit';
import { erros } from '../utils/erros.js';
import { registrarEvento } from './registroHttp.js';

function criarLimitador({ nome, janelaMs, limite }) {
  return rateLimit({
    windowMs: janelaMs,
    limit: limite,
    standardHeaders: 'draft-8', // headers RateLimit-* padronizados
    legacyHeaders: false,
    handler(req, res, next) {
      registrarEvento(req, 'warn', 'rate_limit.excedido', { limitador: nome });
      res.set('Retry-After', String(Math.ceil(janelaMs / 1000)));
      next(erros.muitasRequisicoes());
    },
  });
}

// Funções "fábrica": cada app criado (inclusive nos testes) tem seus próprios contadores
export const criarLimitadorLogin = () =>
  criarLimitador({ nome: 'login', janelaMs: 15 * 60 * 1000, limite: 10 });

export const criarLimitadorAvaliacoes = () =>
  criarLimitador({ nome: 'avaliacoes', janelaMs: 60 * 60 * 1000, limite: 5 });

// As rotas usam estes wrappers; os limitadores de verdade moram em app.locals.limitadores,
// criados por criarApp(). Assim cada app tem contadores próprios (útil nos testes).
export const limitarLogin = (req, res, next) => req.app.locals.limitadores.login(req, res, next);
export const limitarAvaliacoes = (req, res, next) =>
  req.app.locals.limitadores.avaliacoes(req, res, next);
