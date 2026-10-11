// Proteções de borda: cabeçalhos de segurança, CORS, origem, tipo de conteúdo, request id.
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { encerrarConexoes, limparBanco } from '../helpers/banco.js';
import { ORIGEM_FRONT, esperarErro } from '../helpers/http.js';

const app = criarApp();

beforeAll(limparBanco);
afterAll(encerrarConexoes);

describe('cabeçalhos de segurança (helmet)', () => {
  test('esconde o X-Powered-By e manda os cabeçalhos de proteção', async () => {
    const resposta = await request(app).get('/api/categorias');
    expect(resposta.headers['x-powered-by']).toBeUndefined();
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers['content-security-policy']).toBeDefined();
    expect(resposta.headers['strict-transport-security']).toBeDefined();
  });
});

describe('CORS', () => {
  test('libera a origem do front, com credenciais', async () => {
    const resposta = await request(app).get('/api/categorias').set('Origin', ORIGEM_FRONT);
    expect(resposta.headers['access-control-allow-origin']).toBe(ORIGEM_FRONT);
    expect(resposta.headers['access-control-allow-credentials']).toBe('true');
  });

  test('não libera outras origens', async () => {
    const resposta = await request(app).get('/api/categorias').set('Origin', 'https://site-malicioso.example');
    expect(resposta.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('origem de requisições que alteram dados (CSRF)', () => {
  test('POST vindo de outro site é recusado com 403', async () => {
    const resposta = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://site-malicioso.example')
      .send({ email: 'a@b.com', senha: 'x' });
    esperarErro(resposta, 403, 'ORIGEM_NAO_PERMITIDA');
  });
});

describe('corpo da requisição', () => {
  test('mutação que não é JSON recebe 415', async () => {
    const resposta = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('email=a@b.com&senha=x');
    esperarErro(resposta, 415, 'TIPO_NAO_SUPORTADO');
  });

  test('JSON malformado recebe 400', async () => {
    const resposta = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    esperarErro(resposta, 400, 'CORPO_INVALIDO');
  });

  test('corpo grande demais recebe 413', async () => {
    const resposta = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', senha: 'x'.repeat(30_000) });
    esperarErro(resposta, 413, 'CORPO_GRANDE_DEMAIS');
  });
});

describe('request id', () => {
  test('gera um id quando o cliente não manda', async () => {
    const resposta = await request(app).get('/api/rota-que-nao-existe');
    expect(resposta.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(resposta.body.erro.request_id).toBe(resposta.headers['x-request-id']);
  });

  test('reaproveita um id seguro vindo do cliente', async () => {
    const resposta = await request(app).get('/api/categorias').set('X-Request-Id', 'teste-123456');
    expect(resposta.headers['x-request-id']).toBe('teste-123456');
  });

  test('descarta um id com caracteres perigosos (log injection)', async () => {
    const resposta = await request(app)
      .get('/api/categorias')
      .set('X-Request-Id', 'abc"} {"admin":true');
    expect(resposta.headers['x-request-id']).not.toContain('admin');
  });
});

describe('rotas inexistentes e health check', () => {
  test('404 no formato padrão', async () => {
    esperarErro(await request(app).get('/api/nada'), 404, 'ROTA_NAO_ENCONTRADA');
  });

  test('health check responde ok com o banco no ar', async () => {
    const resposta = await request(app).get('/api/saude');
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ status: 'ok', banco: 'ok' });
  });
});

describe('catálogo', () => {
  test('lista as categorias na ordem definida, com a contagem de lugares', async () => {
    const resposta = await request(app).get('/api/categorias');
    expect(resposta.status).toBe(200);
    expect(resposta.body.dados.map((c) => c.slug)).toEqual([
      'pontos-turisticos',
      'restaurantes',
      'bares-e-botecos',
      'padarias-e-cafes',
      'sorveterias',
      'baladas',
      'feiras-e-pracas',
    ]);
    expect(resposta.body.dados[0]).toEqual(
      expect.objectContaining({ icone: 'monumento', total_lugares: 0 }),
    );
  });

  test('lista as tags', async () => {
    const resposta = await request(app).get('/api/tags');
    expect(resposta.body.dados.map((t) => t.slug)).toContain('lgbtqia-friendly');
  });
});
