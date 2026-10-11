import jwt from 'jsonwebtoken';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { POLITICA_BLOQUEIO } from '../../src/services/authService.js';
import { SENHA_ADMIN_TESTE, bancoDono, criarAdmin, encerrarConexoes, limparBanco } from '../helpers/banco.js';
import { ORIGEM_FRONT, agenteAdmin, esperarErro } from '../helpers/http.js';

beforeEach(limparBanco);
afterAll(encerrarConexoes);

const login = (app, corpo) =>
  request(app).post('/api/auth/login').set('Origin', ORIGEM_FRONT).send(corpo);

describe('POST /api/auth/login', () => {
  test('login certo devolve o admin e grava o cookie de sessão protegido', async () => {
    await criarAdmin({ email: 'admin@rolesp.test' });

    const resposta = await login(criarApp(), { email: 'Admin@Rolesp.test', senha: SENHA_ADMIN_TESTE });

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados).toEqual({ id: 1, email: 'admin@rolesp.test' });
    expect(resposta.body.dados).not.toHaveProperty('senha_hash');

    const cookie = resposta.headers['set-cookie'][0];
    expect(cookie).toMatch(/^__session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api/);
    expect(resposta.headers['cache-control']).toBe('no-store');
  });

  test('e-mail inexistente e senha errada recebem exatamente a mesma resposta', async () => {
    await criarAdmin({ email: 'admin@rolesp.test' });
    const app = criarApp();

    const emailErrado = await login(app, { email: 'ninguem@rolesp.test', senha: 'qualquer' });
    const senhaErrada = await login(app, { email: 'admin@rolesp.test', senha: 'errada' });

    esperarErro(emailErrado, 401, 'CREDENCIAIS_INVALIDAS');
    esperarErro(senhaErrada, 401, 'CREDENCIAIS_INVALIDAS');
    expect(emailErrado.body.erro.mensagem).toBe(senhaErrada.body.erro.mensagem);
    expect(emailErrado.headers['set-cookie']).toBeUndefined();
  });

  test(`bloqueia a conta após ${POLITICA_BLOQUEIO.limite} senhas erradas, mesmo com a senha certa depois`, async () => {
    await criarAdmin({ email: 'admin@rolesp.test' });
    const app = criarApp();

    for (let i = 0; i < POLITICA_BLOQUEIO.limite; i += 1) {
      esperarErro(await login(app, { email: 'admin@rolesp.test', senha: `errada-${i}` }), 401, 'CREDENCIAIS_INVALIDAS');
    }
    const comSenhaCerta = await login(app, { email: 'admin@rolesp.test', senha: SENHA_ADMIN_TESTE });
    esperarErro(comSenhaCerta, 401, 'CREDENCIAIS_INVALIDAS');

    const { rows } = await bancoDono.query('SELECT tentativas_falhas, bloqueado_ate FROM admins');
    expect(rows[0].tentativas_falhas).toBe(POLITICA_BLOQUEIO.limite);
    expect(rows[0].bloqueado_ate.getTime()).toBeGreaterThan(Date.now());
  });

  test('depois que o bloqueio vence, o login volta a funcionar e zera as falhas', async () => {
    await criarAdmin({ email: 'admin@rolesp.test' });
    await bancoDono.query(
      `UPDATE admins SET tentativas_falhas = 5, bloqueado_ate = now() - interval '1 minute'`,
    );

    const resposta = await login(criarApp(), { email: 'admin@rolesp.test', senha: SENHA_ADMIN_TESTE });

    expect(resposta.status).toBe(200);
    const { rows } = await bancoDono.query('SELECT tentativas_falhas, bloqueado_ate, ultimo_login_em FROM admins');
    expect(rows[0]).toEqual(expect.objectContaining({ tentativas_falhas: 0, bloqueado_ate: null }));
    expect(rows[0].ultimo_login_em).toBeInstanceOf(Date);
  });

  test('rate limit por IP: a 11ª tentativa em 15 minutos recebe 429 com Retry-After', async () => {
    const app = criarApp();
    for (let i = 0; i < 10; i += 1) {
      await login(app, { email: `x${i}@rolesp.test`, senha: 'x' });
    }
    const resposta = await login(app, { email: 'x@rolesp.test', senha: 'x' });

    esperarErro(resposta, 429, 'MUITAS_REQUISICOES');
    expect(Number(resposta.headers['retry-after'])).toBeGreaterThan(0);
  });

  test.each([
    [{ email: 'nao-e-email', senha: 'x' }],
    [{ email: 'admin@rolesp.test' }],
    [{ email: 'admin@rolesp.test', senha: 'x', admin: true }], // campo extra (mass assignment)
    [{ email: 'admin@rolesp.test', senha: 'x'.repeat(201) }],
  ])('corpo inválido recebe 400: %j', async (corpo) => {
    esperarErro(await login(criarApp(), corpo), 400, 'VALIDACAO');
  });
});

describe('sessão (/api/auth/me, /api/auth/logout e rotas de admin)', () => {
  test('/me responde com o admin logado', async () => {
    const agente = await agenteAdmin();
    const resposta = await agente.get('/api/auth/me');
    expect(resposta.status).toBe(200);
    expect(resposta.body.dados).toEqual({ id: 1, email: 'admin@rolesp.test' });
  });

  test('/me sem cookie recebe 401', async () => {
    esperarErro(await request(criarApp()).get('/api/auth/me'), 401, 'NAO_AUTENTICADO');
  });

  test('token assinado com outro segredo é recusado', async () => {
    await criarAdmin();
    const falso = jwt.sign({ sub: '1' }, 'outro-segredo-qualquer-com-32-caracteres!', {
      issuer: 'rolesp-api',
      audience: 'rolesp-admin',
    });
    const resposta = await request(criarApp()).get('/api/auth/me').set('Cookie', `__session=${falso}`);
    esperarErro(resposta, 401, 'NAO_AUTENTICADO');
  });

  test('token com alg "none" é recusado', async () => {
    await criarAdmin();
    const cabecalho = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const corpo = Buffer.from(
      JSON.stringify({ sub: '1', iss: 'rolesp-api', aud: 'rolesp-admin', exp: 9_999_999_999 }),
    ).toString('base64url');
    const resposta = await request(criarApp())
      .get('/api/auth/me')
      .set('Cookie', `__session=${cabecalho}.${corpo}.`);
    esperarErro(resposta, 401, 'NAO_AUTENTICADO');
  });

  test('token expirado é recusado com mensagem de sessão expirada', async () => {
    await criarAdmin();
    const expirado = jwt.sign({ sub: '1' }, process.env.JWT_SECRET, {
      issuer: 'rolesp-api',
      audience: 'rolesp-admin',
      expiresIn: -10,
    });
    const resposta = await request(criarApp()).get('/api/auth/me').set('Cookie', `__session=${expirado}`);
    esperarErro(resposta, 401, 'NAO_AUTENTICADO');
    expect(resposta.body.erro.mensagem).toMatch(/expirou/);
  });

  test('admin removido perde o acesso mesmo com token ainda válido', async () => {
    const agente = await agenteAdmin();
    await bancoDono.query('DELETE FROM admins');
    esperarErro(await agente.get('/api/auth/me'), 401, 'NAO_AUTENTICADO');
  });

  test('logout apaga o cookie', async () => {
    const agente = await agenteAdmin();
    const resposta = await agente.post('/api/auth/logout').set('Origin', ORIGEM_FRONT);
    expect(resposta.status).toBe(204);
    expect(resposta.headers['set-cookie'][0]).toMatch(/__session=;/);
    esperarErro(await agente.get('/api/auth/me'), 401, 'NAO_AUTENTICADO');
  });

  test('rotas de admin exigem sessão e nunca vão para cache', async () => {
    const semSessao = await request(criarApp()).get('/api/admin/avaliacoes');
    esperarErro(semSessao, 401, 'NAO_AUTENTICADO');
    expect(semSessao.headers['cache-control']).toBe('no-store');
  });
});
