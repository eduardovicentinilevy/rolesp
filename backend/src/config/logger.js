// Logs estruturados em JSON (pino). No Cloud Run, o stdout vai direto para o Cloud Logging,
// que entende o campo "severity" e o campo "message".
import pino from 'pino';
import { ambiente } from './ambiente.js';

// Nível do pino -> severidade do Google Cloud Logging
const SEVERIDADE = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

export const logger = pino({
  level: ambiente.LOG_LEVEL,
  messageKey: 'message',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { servico: 'rolesp-api' },
  formatters: {
    level: (rotulo) => ({ level: rotulo, severity: SEVERIDADE[rotulo] ?? 'DEFAULT' }),
  },
  // Segredos nunca chegam ao log, mesmo por engano
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'senha',
      '*.senha',
      'senha_hash',
      '*.senha_hash',
    ],
    censor: '[removido]',
  },
  ...(ambiente.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { messageKey: 'message' } },
  }),
});
