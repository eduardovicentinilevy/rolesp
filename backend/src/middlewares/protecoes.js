// Proteções de borda: origem das requisições, tipo de conteúdo e cache.
import { ambiente } from '../config/ambiente.js';
import { ErroApp, erros } from '../utils/erros.js';
import { registrarEvento } from './registroHttp.js';

const METODOS_QUE_ALTERAM = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Defesa contra CSRF (em conjunto com o cookie SameSite=Strict):
// se o navegador informar uma Origin fora da lista, a requisição que altera dados é recusada.
// Sem Origin (curl, testes, servidor-servidor) não há navegador para ser enganado.
export function verificarOrigem(req, _res, next) {
  const origem = req.get('origin');
  if (METODOS_QUE_ALTERAM.has(req.method) && origem && !ambiente.CORS_ORIGENS.includes(origem)) {
    registrarEvento(req, 'warn', 'seguranca.origem_bloqueada', { origem });
    throw erros.origemNaoPermitida();
  }
  next();
}

// Mutações com corpo só aceitam JSON. Um formulário HTML de outro site não consegue
// mandar application/json sem passar pelo preflight do CORS.
export function exigirJson(req, _res, next) {
  const temCorpo = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding');
  if (METODOS_QUE_ALTERAM.has(req.method) && temCorpo && !req.is('application/json')) {
    throw new ErroApp(415, 'TIPO_NAO_SUPORTADO', 'Envie o corpo como application/json.');
  }
  next();
}

// Respostas autenticadas nunca ficam em cache (nem no navegador, nem em CDN)
export function semCache(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
