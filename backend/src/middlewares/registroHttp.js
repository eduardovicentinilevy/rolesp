// Log de cada requisição com um request id.
// O id vem do header X-Request-Id (se for um valor seguro) ou é gerado aqui, e volta na
// resposta. Quem reporta um erro informa o id, e o log da requisição aparece na hora:
// a mesma ideia de correlacionar eventos num SIEM.
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

// Só aceita ids curtos e sem caracteres especiais: evita "log injection"
const FORMATO_ID_SEGURO = /^[A-Za-z0-9._-]{8,64}$/;

export const registroHttp = pinoHttp({
  logger,
  genReqId(req, res) {
    const recebido = req.get?.('x-request-id') ?? req.headers['x-request-id'];
    const id = typeof recebido === 'string' && FORMATO_ID_SEGURO.test(recebido) ? recebido : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customAttributeKeys: { reqId: 'request_id' },
  // Health check a cada poucos segundos só poluiria o log
  autoLogging: { ignore: (req) => req.url === '/api/saude' },
  customLogLevel(_req, res, erro) {
    if (erro || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      ip: req.raw?.ip ?? req.remoteAddress,
      user_agent: req.headers?.['user-agent'],
    }),
    res: (res) => ({ status: res.statusCode }),
  },
});

// Eventos de segurança com nome fixo: viram métricas e alertas no Cloud Logging
export function registrarEvento(req, nivel, evento, dados = {}, mensagem = evento) {
  req.log[nivel]({ evento, ip: req.ip, user_agent: req.get('user-agent'), ...dados }, mensagem);
}
