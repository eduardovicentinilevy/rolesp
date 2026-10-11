// Utilitários de banco para os testes: limpeza entre testes e fixtures (dados de exemplo).
// Usa o papel dono (DATABASE_URL_MIGRACAO), que pode dar TRUNCATE; a API continua usando
// o papel de menor privilégio, como em produção.
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { pool } from '../../src/db/pool.js';

export const bancoDono = new pg.Pool({ connectionString: process.env.DATABASE_URL_MIGRACAO, max: 2 });

// Apaga o conteúdo, mas mantém os dados de referência (idiomas, categorias, tags)
export async function limparBanco() {
  await bancoDono.query(`
    TRUNCATE avaliacoes, roteiro_lugar_traducoes, roteiro_lugares, roteiro_traducoes, roteiros,
             lugar_tags, lugar_horarios, lugar_traducoes, lugares,
             bairro_traducoes, bairros, admins
    RESTART IDENTITY CASCADE`);
}

export async function encerrarConexoes() {
  await bancoDono.end();
  await pool.end();
}

export async function criarBairro({
  nome = 'Mooca',
  slug = 'mooca',
  zona = 'leste',
  latitude = -23.55,
  longitude = -46.6,
  destaque = false,
  traducoes = { pt: { descricao: `Descrição de ${nome}` } },
} = {}) {
  const { rows } = await bancoDono.query(
    `INSERT INTO bairros (nome, slug, zona, latitude, longitude, destaque)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [nome, slug, zona, latitude, longitude, destaque],
  );
  const id = rows[0].id;
  for (const [idioma, t] of Object.entries(traducoes)) {
    await bancoDono.query(
      `INSERT INTO bairro_traducoes (bairro_id, idioma, descricao, historia, curiosidades)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, idioma, t.descricao, t.historia ?? null, t.curiosidades ?? []],
    );
  }
  return id;
}

export async function criarLugar({
  nome = 'Lugar de Teste',
  slug = 'lugar-de-teste',
  categoria = 'restaurantes',
  bairro = 'mooca',
  endereco = null,
  latitude = null,
  longitude = null,
  faixaPreco = null,
  isBairrista = false,
  verificado = false,
  traducoes = { pt: { descricao: `Descrição de ${nome}` } },
  tags = [],
  horarios = [],
} = {}) {
  const { rows } = await bancoDono.query(
    `INSERT INTO lugares (nome, slug, categoria_id, bairro_id, endereco, latitude, longitude,
                          faixa_preco, is_bairrista, verificado_em)
     VALUES ($1, $2, (SELECT id FROM categorias WHERE slug = $3), (SELECT id FROM bairros WHERE slug = $4),
             $5, $6, $7, $8, $9, CASE WHEN $10::boolean THEN now() END)
     RETURNING id`,
    [nome, slug, categoria, bairro, endereco, latitude, longitude, faixaPreco, isBairrista, verificado],
  );
  const id = rows[0].id;
  for (const [idioma, t] of Object.entries(traducoes)) {
    await bancoDono.query(
      `INSERT INTO lugar_traducoes (lugar_id, idioma, descricao, dica_local, imagem_alt, horario_observacao)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, idioma, t.descricao, t.dica_local ?? null, t.imagem_alt ?? null, t.horario_observacao ?? null],
    );
  }
  for (const tag of tags) {
    await bancoDono.query(
      'INSERT INTO lugar_tags (lugar_id, tag_id) SELECT $1, id FROM tags WHERE slug = $2',
      [id, tag],
    );
  }
  for (const h of horarios) {
    await bancoDono.query(
      'INSERT INTO lugar_horarios (lugar_id, dia_semana, abre, fecha) VALUES ($1, $2, $3, $4)',
      [id, h.dia_semana, h.abre, h.fecha],
    );
  }
  return id;
}

export async function criarAvaliacao({
  lugarId,
  nota = 5,
  comentario = 'Muito bom',
  nomeAutor = null,
  idioma = 'pt',
  status = 'aprovada',
  criadoEm = null,
}) {
  const { rows } = await bancoDono.query(
    `INSERT INTO avaliacoes (lugar_id, nota, comentario, nome_autor, idioma, status, moderado_em, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6::varchar, CASE WHEN $6::varchar <> 'pendente' THEN now() END, coalesce($7, now()))
     RETURNING id`,
    [lugarId, nota, comentario, nomeAutor, idioma, status, criadoEm],
  );
  return rows[0].id;
}

export async function criarRoteiro({
  slug = 'roteiro-teste',
  bairro = null,
  duracaoMinutos = 120,
  traducoes = { pt: { titulo: 'Roteiro de teste', descricao: 'Descrição do roteiro' } },
  paradas = [], // [{ lugarId, observacoes: { pt: '...' } }]
} = {}) {
  const { rows } = await bancoDono.query(
    `INSERT INTO roteiros (slug, bairro_id, duracao_minutos)
     VALUES ($1, (SELECT id FROM bairros WHERE slug = $2), $3) RETURNING id`,
    [slug, bairro, duracaoMinutos],
  );
  const id = rows[0].id;
  for (const [idioma, t] of Object.entries(traducoes)) {
    await bancoDono.query(
      'INSERT INTO roteiro_traducoes (roteiro_id, idioma, titulo, descricao) VALUES ($1, $2, $3, $4)',
      [id, idioma, t.titulo, t.descricao],
    );
  }
  for (const [indice, parada] of paradas.entries()) {
    await bancoDono.query(
      'INSERT INTO roteiro_lugares (roteiro_id, lugar_id, ordem) VALUES ($1, $2, $3)',
      [id, parada.lugarId, indice + 1],
    );
    for (const [idioma, observacao] of Object.entries(parada.observacoes ?? {})) {
      await bancoDono.query(
        `INSERT INTO roteiro_lugar_traducoes (roteiro_id, lugar_id, idioma, observacao)
         VALUES ($1, $2, $3, $4)`,
        [id, parada.lugarId, idioma, observacao],
      );
    }
  }
  return id;
}

export const SENHA_ADMIN_TESTE = 'senha-de-teste-bem-longa';

// Custo 4 só nos testes, para ficarem rápidos (produção usa 12)
export async function criarAdmin({ email = 'admin@rolesp.test', senha = SENHA_ADMIN_TESTE } = {}) {
  const hash = await bcrypt.hash(senha, 4);
  const { rows } = await bancoDono.query(
    'INSERT INTO admins (email, senha_hash) VALUES ($1, $2) RETURNING id',
    [email, hash],
  );
  return rows[0].id;
}
