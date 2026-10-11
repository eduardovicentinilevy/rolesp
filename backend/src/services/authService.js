// Autenticação do painel admin: bcrypt + JWT, com bloqueio por força bruta.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ambiente } from '../config/ambiente.js';
import * as adminsRepository from '../repositories/adminsRepository.js';
import { erros } from '../utils/erros.js';

export const CUSTO_BCRYPT = 12;
export const POLITICA_BLOQUEIO = Object.freeze({ limite: 5, bloqueioMinutos: 15 });

const OPCOES_JWT = Object.freeze({
  algorithm: 'HS256',
  issuer: 'rolesp-api',
  audience: 'rolesp-admin',
});

// Hash bcrypt (custo 12) de um texto aleatório descartado. Quando o e-mail não existe,
// comparamos a senha com ele mesmo assim: a resposta leva o mesmo tempo que um e-mail
// existente com senha errada, e o tempo não revela quais e-mails são de admins.
const HASH_FALSO = '$2b$12$si8oWv2coA/4LaB6nfmwD.PjsoZxKLXqPUiO.SEbuRJTI9N9cvOOC';

// Falha de login com o motivo real, só para o log. A resposta HTTP é sempre a mesma.
function falhaDeLogin(motivo, extras = {}) {
  const erro = erros.credenciaisInvalidas();
  erro.contexto = { motivo, ...extras };
  return erro;
}

export async function login(email, senha) {
  const admin = await adminsRepository.buscarPorEmail(email);

  if (!admin) {
    await bcrypt.compare(senha, HASH_FALSO);
    throw falhaDeLogin('email_inexistente');
  }

  const senhaCorreta = await bcrypt.compare(senha, admin.senha_hash);

  // Conta bloqueada: recusa até com a senha certa (a comparação acima mantém o tempo igual)
  if (admin.bloqueado_ate && admin.bloqueado_ate > new Date()) {
    throw falhaDeLogin('conta_bloqueada', { admin_id: admin.id, bloqueado_ate: admin.bloqueado_ate });
  }

  if (!senhaCorreta) {
    const situacao = await adminsRepository.registrarFalha(admin.id, POLITICA_BLOQUEIO);
    throw falhaDeLogin('senha_incorreta', {
      admin_id: admin.id,
      tentativas_falhas: situacao.tentativas_falhas,
      bloqueou_agora: situacao.tentativas_falhas >= POLITICA_BLOQUEIO.limite,
    });
  }

  await adminsRepository.registrarSucesso(admin.id);
  const token = jwt.sign({ sub: String(admin.id) }, ambiente.JWT_SECRET, {
    ...OPCOES_JWT,
    expiresIn: `${ambiente.JWT_EXPIRACAO_MINUTOS}m`,
  });
  return { admin: { id: admin.id, email: admin.email }, token };
}

// Valida o token e confere se o admin ainda existe (admin removido perde o acesso na hora).
export async function validarToken(token) {
  let payload;
  try {
    // algorithms fixo: impede ataques que trocam o "alg" do token (ex.: "none")
    payload = jwt.verify(token, ambiente.JWT_SECRET, {
      algorithms: [OPCOES_JWT.algorithm],
      issuer: OPCOES_JWT.issuer,
      audience: OPCOES_JWT.audience,
    });
  } catch (erro) {
    const expirado = erro.name === 'TokenExpiredError';
    const falha = erros.naoAutenticado(
      expirado ? 'Sua sessão expirou. Faça login de novo.' : 'Sessão inválida. Faça login de novo.',
    );
    falha.contexto = { motivo: expirado ? 'token_expirado' : 'token_invalido' };
    throw falha;
  }

  const admin = await adminsRepository.buscarPorId(Number(payload.sub));
  if (!admin) {
    const falha = erros.naoAutenticado();
    falha.contexto = { motivo: 'admin_inexistente' };
    throw falha;
  }
  return admin;
}

export function gerarHashSenha(senha, custo = CUSTO_BCRYPT) {
  return bcrypt.hash(senha, custo);
}
