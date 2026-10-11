// Monta o app Express, sem abrir porta. O server.js abre a porta; os testes usam o app direto
// com o Supertest, sem rede: mais rápido e sem conflito de porta.
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { ambiente } from './config/ambiente.js';
import { rotaNaoEncontrada, tratarErros } from './middlewares/erros.js';
import { criarLimitadorAvaliacoes, criarLimitadorLogin } from './middlewares/limitadores.js';
import { exigirJson, verificarOrigem } from './middlewares/protecoes.js';
import { registroHttp } from './middlewares/registroHttp.js';
import { rotas } from './routes/index.js';

export function criarApp() {
  const app = express();

  // Atrás do Google Front End/Firebase, o IP real do cliente vem no X-Forwarded-For.
  // Sem isso, o rate limit enxergaria todo mundo com o mesmo IP (o do proxy).
  app.set('trust proxy', ambiente.TRUST_PROXY);
  app.disable('x-powered-by');

  // Cada app tem seus próprios contadores de rate limit
  app.locals.limitadores = {
    login: criarLimitadorLogin(),
    avaliacoes: criarLimitadorAvaliacoes(),
  };

  app.use(registroHttp);
  app.use(helmet());
  app.use(
    cors({
      // Lista fechada de origens; credentials para o cookie de sessão do admin
      origin: ambiente.CORS_ORIGENS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      maxAge: 600,
    }),
  );
  app.use(verificarOrigem);
  app.use(exigirJson);
  // Limite de tamanho do corpo: nenhuma requisição legítima da API passa de alguns KB
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  app.use('/api', rotas);

  app.use(rotaNaoEncontrada);
  app.use(tratarErros);
  return app;
}
