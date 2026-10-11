import { ambiente } from '../config/ambiente.js';
import { NOME_COOKIE_SESSAO } from '../middlewares/autenticar.js';
import { registrarEvento } from '../middlewares/registroHttp.js';
import * as authService from '../services/authService.js';

// httpOnly: o JavaScript da página não lê o cookie (um XSS não rouba a sessão)
// sameSite strict: o navegador não manda o cookie em requisições vindas de outro site (CSRF)
// path /api: o cookie só vai para a API, não para os arquivos do site
const opcoesCookie = () => ({
  httpOnly: true,
  secure: ambiente.COOKIE_SECURE,
  sameSite: 'strict',
  path: '/api',
});

export async function login(req, res) {
  const { email, senha } = req.validado.body;
  try {
    const { admin, token } = await authService.login(email, senha);
    registrarEvento(req, 'info', 'auth.login_sucesso', { admin_id: admin.id, email: admin.email });
    res.cookie(NOME_COOKIE_SESSAO, token, {
      ...opcoesCookie(),
      maxAge: ambiente.JWT_EXPIRACAO_MINUTOS * 60 * 1000,
    });
    res.json({ dados: admin });
  } catch (erro) {
    if (erro.codigo === 'CREDENCIAIS_INVALIDAS') {
      // O e-mail tentado é registrado: é o dado que permite detectar credential stuffing
      registrarEvento(req, 'warn', 'auth.login_falhou', { email, ...erro.contexto });
      if (erro.contexto?.bloqueou_agora) {
        registrarEvento(req, 'warn', 'auth.conta_bloqueada', {
          email,
          admin_id: erro.contexto.admin_id,
        });
      }
    }
    throw erro;
  }
}

export function logout(_req, res) {
  res.clearCookie(NOME_COOKIE_SESSAO, opcoesCookie());
  res.status(204).end();
}

export function eu(req, res) {
  res.json({ dados: req.admin });
}
