// Categorias e tags: listas pequenas usadas nos filtros e atalhos da home.
import { pool } from '../db/pool.js';

export async function listarCategorias(executor = pool) {
  const { rows } = await executor.query(
    `SELECT c.slug, c.nome, c.icone, c.ordem, count(l.id)::int AS total_lugares
       FROM categorias c
       LEFT JOIN lugares l ON l.categoria_id = c.id
      GROUP BY c.id
      ORDER BY c.ordem, c.nome`,
  );
  return rows;
}

export async function listarTags(executor = pool) {
  const { rows } = await executor.query(
    `SELECT tg.slug, tg.nome, count(lt.lugar_id)::int AS total_lugares
       FROM tags tg
       LEFT JOIN lugar_tags lt ON lt.tag_id = tg.id
      GROUP BY tg.id
      ORDER BY tg.nome`,
  );
  return rows;
}

export async function verificarBanco(executor = pool) {
  await executor.query('SELECT 1');
}
