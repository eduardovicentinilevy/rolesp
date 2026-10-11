// Helpers HTTP para os testes (Supertest chama o app direto, sem abrir porta).
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { SENHA_ADMIN_TESTE, criarAdmin } from './banco.js';

export const ORIGEM_FRONT = 'http://localhost:5173';

// Cria um admin, faz login e devolve um "agent" que guarda o cookie de sessão
export async function agenteAdmin(app = criarApp(), { email = 'admin@rolesp.test' } = {}) {
  await criarAdmin({ email });
  const agente = request.agent(app);
  const resposta = await agente
    .post('/api/auth/login')
    .set('Origin', ORIGEM_FRONT)
    .send({ email, senha: SENHA_ADMIN_TESTE });
  if (resposta.status !== 200) {
    throw new Error(`login de teste falhou: ${resposta.status} ${JSON.stringify(resposta.body)}`);
  }
  return agente;
}

// Confere o formato padrão de erro da API
export function esperarErro(resposta, status, codigo) {
  expect(resposta.status).toBe(status);
  expect(resposta.body.erro).toEqual(
    expect.objectContaining({ codigo, mensagem: expect.any(String), request_id: expect.any(String) }),
  );
}
