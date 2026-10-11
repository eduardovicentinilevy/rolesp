// Protege as rotas /api/admin: exige o cookie de sessão com um JWT válido.
// Esconder o /admin no front é só conveniência; quem protege de verdade é este middleware.
import * as authService from '../services/authService.js';
import { erros } from '../utils/erros.js';
import { registrarEvento } from './registroHttp.js';

// O Firebase Hosting só repassa ao Cloud Run um cookie com este nome exato
export const NOME_COOKIE_SESSAO = '__session';

export async function autenticar(req, _res, next) {
  const token = req.cookies?.[NOME_COOKIE_SESSAO];
  if (!token) throw erros.naoAutenticado();

  try {
    req.admin = await authService.validarToken(token);
  } catch (erro) {
    // assinatura inválida pode ser adulteração: vale registrar
    if (erro.contexto?.motivo === 'token_invalido') {
      registrarEvento(req, 'warn', 'auth.token_invalido');
    }
    throw erro;
  }
  req.log = req.log.child({ admin_id: req.admin.id });
  next();
}
