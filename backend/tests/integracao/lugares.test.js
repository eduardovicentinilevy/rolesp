import request from 'supertest';
import { criarApp } from '../../src/app.js';
import {
  criarAvaliacao,
  criarBairro,
  criarLugar,
  criarRoteiro,
  encerrarConexoes,
  limparBanco,
} from '../helpers/banco.js';
import { esperarErro } from '../helpers/http.js';

const app = criarApp();

beforeEach(async () => {
  await limparBanco();
  await criarBairro({ nome: 'Mooca', slug: 'mooca', zona: 'leste' });
  await criarBairro({ nome: 'Liberdade', slug: 'liberdade', zona: 'centro' });
});

afterAll(encerrarConexoes);

describe('GET /api/lugares', () => {
  test('lista com o formato padrão e a paginação', async () => {
    await criarLugar({ nome: 'Padaria da Esquina', slug: 'padaria-da-esquina', categoria: 'padarias-e-cafes' });

    const resposta = await request(app).get('/api/lugares');

    expect(resposta.status).toBe(200);
    expect(resposta.body.paginacao).toEqual({ pagina: 1, limite: 20, total: 1, total_paginas: 1 });
    expect(resposta.body.dados[0]).toEqual(
      expect.objectContaining({
        slug: 'padaria-da-esquina',
        nome: 'Padaria da Esquina',
        categoria: expect.objectContaining({ slug: 'padarias-e-cafes' }),
        bairro: { slug: 'mooca', nome: 'Mooca' },
        verificado: false,
        media_notas: null, // sem avaliação: média nula, não zero
        total_avaliacoes: 0,
        idioma_conteudo: 'pt',
        tags: [],
      }),
    );
    // o id interno não vaza nas rotas públicas: a URL pública usa o slug
    expect(resposta.body.dados[0]).not.toHaveProperty('id');
  });

  test('combina filtros de categoria, bairro, preço e "só bairristas"', async () => {
    await criarLugar({ nome: 'Cantina A', slug: 'cantina-a', bairro: 'mooca', faixaPreco: 2, isBairrista: true });
    await criarLugar({ nome: 'Cantina B', slug: 'cantina-b', bairro: 'mooca', faixaPreco: 4, isBairrista: true });
    await criarLugar({ nome: 'Cantina C', slug: 'cantina-c', bairro: 'liberdade', faixaPreco: 2, isBairrista: true });
    await criarLugar({ nome: 'Cantina D', slug: 'cantina-d', bairro: 'mooca', faixaPreco: 2, isBairrista: false });
    await criarLugar({ nome: 'Bar E', slug: 'bar-e', categoria: 'bares-e-botecos', bairro: 'mooca', faixaPreco: 2, isBairrista: true });

    const resposta = await request(app).get(
      '/api/lugares?categoria=restaurantes&bairro=mooca&preco=1,2&bairrista=true',
    );

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados.map((l) => l.slug)).toEqual(['cantina-a']);
  });

  test('aceita listas repetindo o parâmetro (?bairro=a&bairro=b)', async () => {
    await criarLugar({ nome: 'A', slug: 'a', bairro: 'mooca' });
    await criarLugar({ nome: 'B', slug: 'b', bairro: 'liberdade' });

    const resposta = await request(app).get('/api/lugares?bairro=mooca&bairro=liberdade');

    expect(resposta.body.paginacao.total).toBe(2);
  });

  test('filtro de tags exige TODAS as tags pedidas', async () => {
    await criarLugar({ nome: 'Vegano e pet', slug: 'vegano-e-pet', tags: ['vegano', 'pet-friendly'] });
    await criarLugar({ nome: 'Só vegano', slug: 'so-vegano', tags: ['vegano'] });

    const resposta = await request(app).get('/api/lugares?tags=vegano,pet-friendly');

    expect(resposta.body.dados.map((l) => l.slug)).toEqual(['vegano-e-pet']);
    expect(resposta.body.dados[0].tags.map((t) => t.slug).sort()).toEqual(['pet-friendly', 'vegano']);
  });

  test('tag inexistente não traz nada (e não dá erro)', async () => {
    await criarLugar({ nome: 'X', slug: 'x', tags: ['vegano'] });
    const resposta = await request(app).get('/api/lugares?tags=vegano,nao-existe');
    expect(resposta.status).toBe(200);
    expect(resposta.body.dados).toEqual([]);
  });

  describe('busca textual', () => {
    beforeEach(async () => {
      await criarLugar({
        nome: 'Barraca do Japonês',
        slug: 'barraca-do-japones',
        traducoes: {
          pt: { descricao: 'Pastéis enormes e caldo de cana na feira de rua.' },
          en: { descricao: 'Huge fried pastries and sugarcane juice at the street market.' },
        },
      });
      await criarLugar({
        nome: 'Parque Ibirapuera',
        slug: 'parque-ibirapuera',
        categoria: 'pontos-turisticos',
        traducoes: { pt: { descricao: 'O parque mais famoso da cidade.' } },
      });
    });

    test('ignora acentos e acha pelo radical da palavra', async () => {
      const resposta = await request(app).get('/api/lugares?q=pasteis');
      expect(resposta.body.dados.map((l) => l.slug)).toEqual(['barraca-do-japones']);
    });

    test('busca no idioma pedido usando o stemming daquele idioma', async () => {
      const resposta = await request(app).get('/api/lugares?q=pastry&lang=en');
      expect(resposta.body.dados.map((l) => l.slug)).toEqual(['barraca-do-japones']);
      expect(resposta.body.dados[0].idioma_conteudo).toBe('en');
    });

    test('acha por pedaço do nome', async () => {
      const resposta = await request(app).get('/api/lugares?q=ibira');
      expect(resposta.body.dados.map((l) => l.slug)).toEqual(['parque-ibirapuera']);
    });

    test('curingas do LIKE são tratados como texto', async () => {
      const resposta = await request(app).get(`/api/lugares?q=${encodeURIComponent('%')}`);
      expect(resposta.status).toBe(200);
      expect(resposta.body.dados).toEqual([]);
    });

    test('tentativas de SQL injection viram só texto de busca', async () => {
      const ataques = ["' OR 1=1 --", "'; DROP TABLE lugares; --", '") OR ("1"="1', 'x\\'];
      for (const ataque of ataques) {
        const resposta = await request(app).get(`/api/lugares?q=${encodeURIComponent(ataque)}`);
        expect(resposta.status).toBe(200);
        expect(resposta.body.dados).toEqual([]);
      }
      // a tabela continua lá
      const todos = await request(app).get('/api/lugares');
      expect(todos.body.paginacao.total).toBe(2);
    });
  });

  test('cai para o português quando não há tradução no idioma pedido', async () => {
    await criarLugar({
      nome: 'Só em PT',
      slug: 'so-em-pt',
      traducoes: { pt: { descricao: 'Texto em português', dica_local: 'Vá cedo' } },
    });

    const resposta = await request(app).get('/api/lugares?lang=en');

    expect(resposta.body.dados[0]).toEqual(
      expect.objectContaining({ descricao: 'Texto em português', dica_local: 'Vá cedo', idioma_conteudo: 'pt' }),
    );
  });

  test('média e total consideram só avaliações aprovadas', async () => {
    const id = await criarLugar({ nome: 'Avaliado', slug: 'avaliado' });
    await criarAvaliacao({ lugarId: id, nota: 5, status: 'aprovada' });
    await criarAvaliacao({ lugarId: id, nota: 4, status: 'aprovada' });
    await criarAvaliacao({ lugarId: id, nota: 1, status: 'pendente' });
    await criarAvaliacao({ lugarId: id, nota: 1, status: 'rejeitada' });

    const resposta = await request(app).get('/api/lugares');

    expect(resposta.body.dados[0]).toEqual(
      expect.objectContaining({ media_notas: 4.5, total_avaliacoes: 2 }),
    );
  });

  test('ordena por nota com os sem avaliação no fim', async () => {
    const semNota = await criarLugar({ nome: 'A sem nota', slug: 'a-sem-nota' });
    const nota3 = await criarLugar({ nome: 'B nota 3', slug: 'b-nota-3' });
    const nota5 = await criarLugar({ nome: 'C nota 5', slug: 'c-nota-5' });
    await criarAvaliacao({ lugarId: nota3, nota: 3 });
    await criarAvaliacao({ lugarId: nota5, nota: 5 });
    expect(semNota).toBeDefined();

    const resposta = await request(app).get('/api/lugares?ordem=nota');

    expect(resposta.body.dados.map((l) => l.slug)).toEqual(['c-nota-5', 'b-nota-3', 'a-sem-nota']);
  });

  test('ordem alfabética ignora acentos e maiúsculas', async () => {
    await criarLugar({ nome: 'Zebra', slug: 'zebra' });
    await criarLugar({ nome: 'árvore', slug: 'arvore' });
    await criarLugar({ nome: 'Bola', slug: 'bola' });

    const resposta = await request(app).get('/api/lugares?ordem=nome');

    expect(resposta.body.dados.map((l) => l.slug)).toEqual(['arvore', 'bola', 'zebra']);
  });

  test('pagina os resultados e informa o total', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await criarLugar({ nome: `Lugar ${i}`, slug: `lugar-${i}` });
    }

    const pagina2 = await request(app).get('/api/lugares?limit=2&page=2');

    expect(pagina2.body.dados.map((l) => l.slug)).toEqual(['lugar-3', 'lugar-4']);
    expect(pagina2.body.paginacao).toEqual({ pagina: 2, limite: 2, total: 5, total_paginas: 3 });
  });

  test('página além do fim continua informando o total', async () => {
    await criarLugar({ nome: 'Único', slug: 'unico' });

    const resposta = await request(app).get('/api/lugares?page=9');

    expect(resposta.body.dados).toEqual([]);
    expect(resposta.body.paginacao.total).toBe(1);
  });

  test.each([
    ['preco=5', 'preco'],
    ['limit=500', 'limit'],
    ['page=0', 'page'],
    ['lang=xx', 'lang'],
    ['ordem=id;DROP', 'ordem'],
    ['bairrista=sim', 'bairrista'],
    ['categoria=Não%20é%20slug', 'categoria'],
    ['parametro_inventado=1', 'parametro_inventado'],
  ])('rejeita query inválida (%s) com 400', async (query, campo) => {
    const resposta = await request(app).get(`/api/lugares?${query}`);
    esperarErro(resposta, 400, 'VALIDACAO');
    expect(resposta.body.erro.detalhes.map((d) => d.campo).join(' ')).toContain(campo);
  });
});

describe('GET /api/lugares/:slug', () => {
  test('traz o detalhe com horários, tags e roteiros', async () => {
    const id = await criarLugar({
      nome: 'Balada X',
      slug: 'balada-x',
      categoria: 'baladas',
      endereco: 'Rua Exemplo, 1',
      latitude: -23.55,
      longitude: -46.63,
      verificado: true,
      tags: ['aberto-ate-tarde'],
      horarios: [
        { dia_semana: 6, abre: '23:00', fecha: '05:00' },
        { dia_semana: 5, abre: '23:00', fecha: '24:00' },
      ],
      traducoes: { pt: { descricao: 'Pista de techno', horario_observacao: 'Fecha em feriados' } },
    });
    await criarRoteiro({ slug: 'noite', paradas: [{ lugarId: id }], traducoes: { pt: { titulo: 'Noite', descricao: 'x' } } });

    const resposta = await request(app).get('/api/lugares/balada-x');

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados).toEqual(
      expect.objectContaining({
        slug: 'balada-x',
        endereco: 'Rua Exemplo, 1',
        verificado: true,
        verificado_em: expect.any(String),
        horario_observacao: 'Fecha em feriados',
        horarios: [
          { dia_semana: 5, abre: '23:00', fecha: '24:00' },
          { dia_semana: 6, abre: '23:00', fecha: '05:00' },
        ],
        roteiros: [{ slug: 'noite', titulo: 'Noite' }],
      }),
    );
    expect(resposta.body.dados.tags).toEqual([{ slug: 'aberto-ate-tarde', nome: 'Aberto até tarde' }]);
  });

  test('404 no formato padrão para slug inexistente', async () => {
    const resposta = await request(app).get('/api/lugares/nao-existe');
    esperarErro(resposta, 404, 'NAO_ENCONTRADO');
  });

  test('400 para slug com formato inválido', async () => {
    const resposta = await request(app).get('/api/lugares/Slug_Errado!');
    esperarErro(resposta, 400, 'VALIDACAO');
  });
});

describe('GET /api/dica-do-dia', () => {
  test('sorteia um lugar bairrista que tenha dica', async () => {
    await criarLugar({ nome: 'Sem selo', slug: 'sem-selo', traducoes: { pt: { descricao: 'x', dica_local: 'dica' } } });
    await criarLugar({ nome: 'Bairrista sem dica', slug: 'bairrista-sem-dica', isBairrista: true });
    await criarLugar({
      nome: 'Bairrista com dica',
      slug: 'bairrista-com-dica',
      isBairrista: true,
      traducoes: { pt: { descricao: 'x', dica_local: 'Peça o pastel de carne' } },
    });

    const resposta = await request(app).get('/api/dica-do-dia');

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados).toEqual(
      expect.objectContaining({
        dica_local: 'Peça o pastel de carne',
        data: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        lugar: expect.objectContaining({ slug: 'bairrista-com-dica', is_bairrista: true }),
      }),
    );
  });

  test('é estável: duas chamadas no mesmo dia trazem o mesmo lugar', async () => {
    for (let i = 1; i <= 6; i += 1) {
      await criarLugar({
        nome: `B${i}`,
        slug: `b${i}`,
        isBairrista: true,
        traducoes: { pt: { descricao: 'x', dica_local: `dica ${i}` } },
      });
    }
    const primeira = await request(app).get('/api/dica-do-dia');
    const segunda = await request(app).get('/api/dica-do-dia');
    expect(primeira.body.dados.lugar.slug).toBe(segunda.body.dados.lugar.slug);
  });

  test('sem nenhum bairrista com dica, devolve dados nulo (estado vazio)', async () => {
    const resposta = await request(app).get('/api/dica-do-dia');
    expect(resposta.status).toBe(200);
    expect(resposta.body.dados).toBeNull();
  });
});
