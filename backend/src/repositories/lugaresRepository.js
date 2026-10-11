// SQL dos lugares (leitura pública). Todo valor do usuário vai como parâmetro ($n).
import { pool } from '../db/pool.js';
import { Consulta, escaparLike } from '../utils/consulta.js';
import { colunasLugarResumo, hojeEmSaoPaulo, traducaoLugar } from './sqlComum.js';

// ORDER BY não aceita parâmetro, então a ordenação vem de uma lista fechada (whitelist).
// O valor do usuário só escolhe a CHAVE; o SQL é sempre um destes textos fixos.
const ORDENACOES = {
  relevancia: 'relevancia DESC, unaccent(lower(v.nome)), v.id',
  nome: 'unaccent(lower(v.nome)), v.id',
  nota: 'v.media_notas DESC NULLS LAST, v.total_avaliacoes DESC, unaccent(lower(v.nome)), v.id',
  recentes: 'v.criado_em DESC, v.id DESC',
};

// Monta o WHERE a partir dos filtros. Usado pela listagem e pela contagem.
function montarFiltros(filtros) {
  const consulta = new Consulta();
  let cteBusca = '';
  let colunaRelevancia = '0';

  // o idioma é usado pela tradução e pela busca; vira parâmetro só se alguém usar
  const pIdioma = () => consulta.paramNomeado('idioma', filtros.lang);

  if (filtros.categoria?.length) {
    consulta.onde((p) => `v.categoria_slug = ANY(${p(filtros.categoria)}::text[])`);
  }
  if (filtros.bairro?.length) {
    consulta.onde((p) => `v.bairro_slug = ANY(${p(filtros.bairro)}::text[])`);
  }
  if (filtros.preco?.length) {
    consulta.onde((p) => `v.faixa_preco = ANY(${p(filtros.preco)}::int[])`);
  }
  if (filtros.bairrista === true) {
    consulta.onde(() => 'v.is_bairrista');
  }
  if (filtros.tags?.length) {
    // Semântica "E": o lugar precisa ter TODAS as tags pedidas (divisão relacional).
    // Agrupa por lugar e exige que a contagem de tags encontradas seja igual à pedida.
    consulta.onde(
      (p) => `v.id IN (
        SELECT lt.lugar_id
          FROM lugar_tags lt
          JOIN tags tg ON tg.id = lt.tag_id
         WHERE tg.slug = ANY(${p(filtros.tags)}::text[])
         GROUP BY lt.lugar_id
        HAVING count(*) = ${p(filtros.tags.length)})`,
    );
  }
  if (filtros.q) {
    const pTexto = consulta.param(filtros.q);
    const pLike = consulta.param(`%${escaparLike(filtros.q)}%`);
    // As três consultas de texto são calculadas uma vez só, na CTE:
    //  - q_nome: nome do lugar, sem stemming
    //  - q_idioma: texto no idioma pedido, com o stemming daquele idioma
    //  - q_pt: texto em português (o conteúdo de referência do site)
    // websearch_to_tsquery aceita qualquer texto digitado sem erro de sintaxe.
    cteBusca = `
      WITH busca AS (
        SELECT websearch_to_tsquery('busca_simples', ${pTexto})          AS q_nome,
               websearch_to_tsquery(fn_config_busca(${pIdioma()}), ${pTexto}) AS q_idioma,
               websearch_to_tsquery('busca_pt', ${pTexto})                AS q_pt
      )`;
    consulta.onde(
      () => `(
        l.busca @@ b.q_nome
        OR EXISTS (
          SELECT 1 FROM lugar_traducoes tb
           WHERE tb.lugar_id = v.id
             AND ((tb.idioma = ${pIdioma()} AND tb.busca @@ b.q_idioma)
               OR (tb.idioma = 'pt' AND tb.busca @@ b.q_pt)))
        -- pedaço do nome ("ibira" acha "Ibirapuera"), com curingas do LIKE escapados
        OR unaccent(l.nome) ILIKE unaccent(${pLike}) ESCAPE '\\'
      )`,
    );
    // Nome pesa mais que descrição; o ILIKE só desempata
    colunaRelevancia = `(
      ts_rank(l.busca, b.q_nome) * 2
      + coalesce((
          SELECT max(ts_rank(tb.busca, CASE WHEN tb.idioma = ${pIdioma()} THEN b.q_idioma ELSE b.q_pt END))
            FROM lugar_traducoes tb
           WHERE tb.lugar_id = v.id AND tb.idioma IN (${pIdioma()}, 'pt')
        ), 0)
      + CASE WHEN unaccent(l.nome) ILIKE unaccent(${pLike}) ESCAPE '\\' THEN 0.1 ELSE 0 END
    )`;
  }

  const juncaoBusca = filtros.q ? 'JOIN lugares l ON l.id = v.id CROSS JOIN busca b' : '';
  return { consulta, pIdioma, cteBusca, juncaoBusca, colunaRelevancia };
}

export async function listar(filtros, executor = pool) {
  const { consulta, pIdioma, cteBusca, juncaoBusca, colunaRelevancia } = montarFiltros(filtros);
  const ordem = ORDENACOES[filtros.ordem] ?? ORDENACOES.nome;
  const pLimite = consulta.param(filtros.limit);
  const pDeslocamento = consulta.param((filtros.page - 1) * filtros.limit);

  // count(*) OVER () traz o total de linhas filtradas junto com a página, numa query só
  const { rows } = await executor.query(
    `${cteBusca}
     SELECT ${colunasLugarResumo},
            ${colunaRelevancia} AS relevancia,
            count(*) OVER ()::int AS total
       FROM vw_lugares_resumo v
       ${juncaoBusca}
       ${traducaoLugar(pIdioma())}
     ${consulta.where}
     ORDER BY ${ordem}
     LIMIT ${pLimite} OFFSET ${pDeslocamento}`,
    consulta.valores,
  );

  // Limitação do count(*) OVER (): numa página além do fim não volta linha nenhuma,
  // e o total some junto. Só nesse caso fazemos a contagem separada.
  if (rows.length === 0 && filtros.page > 1) {
    return { linhas: rows, total: await contar(filtros, executor) };
  }
  return { linhas: rows, total: rows[0]?.total ?? 0 };
}

async function contar(filtros, executor) {
  const { consulta, cteBusca, juncaoBusca } = montarFiltros(filtros);
  const { rows } = await executor.query(
    `${cteBusca}
     SELECT count(*)::int AS total
       FROM vw_lugares_resumo v
       ${juncaoBusca}
     ${consulta.where}`,
    consulta.valores,
  );
  return rows[0].total;
}

export async function buscarPorSlug(slug, idioma, executor = pool) {
  const { rows } = await executor.query(
    `SELECT ${colunasLugarResumo},
            v.endereco, v.imagem_credito, v.verificado_em, v.atualizado_em,
            l.site, l.instagram,
            t.horario_observacao,
            -- horários como array JSON; left(time::text, 5) -> "09:00" (e "24:00" continua "24:00")
            (SELECT coalesce(json_agg(json_build_object(
                      'dia_semana', h.dia_semana,
                      'abre', left(h.abre::text, 5),
                      'fecha', left(h.fecha::text, 5)
                    ) ORDER BY h.dia_semana, h.abre), '[]'::json)
               FROM lugar_horarios h
              WHERE h.lugar_id = v.id) AS horarios,
            -- roteiros que passam por este lugar, com o título no idioma pedido (ou PT)
            (SELECT coalesce(json_agg(json_build_object('slug', r.slug, 'titulo', rt.titulo)
                      ORDER BY rt.titulo), '[]'::json)
               FROM roteiro_lugares rl
               JOIN roteiros r ON r.id = rl.roteiro_id
               JOIN LATERAL (
                 SELECT tr.titulo FROM roteiro_traducoes tr
                  WHERE tr.roteiro_id = r.id AND tr.idioma IN ($2, 'pt')
                  ORDER BY (tr.idioma = $2) DESC
                  LIMIT 1
               ) rt ON true
              WHERE rl.lugar_id = v.id) AS roteiros
       FROM vw_lugares_resumo v
       JOIN lugares l ON l.id = v.id
       ${traducaoLugar('$2')}
      WHERE v.slug = $1`,
    [slug, idioma],
  );
  return rows[0] ?? null;
}

// Só o id: usado por outros módulos (ex.: avaliações) para checar se o lugar existe
export async function buscarIdPorSlug(slug, executor = pool) {
  const { rows } = await executor.query('SELECT id FROM lugares WHERE slug = $1', [slug]);
  return rows[0]?.id ?? null;
}

// Dica bairrista do dia: sorteio determinístico. O md5 de (id + data de hoje em SP)
// embaralha a ordem de um jeito diferente a cada dia, mas igual para todo mundo no mesmo dia.
// Não precisa de cron nem de tabela extra.
export async function dicaDoDia(idioma, executor = pool) {
  const { rows } = await executor.query(
    `SELECT v.slug, v.nome, v.imagem_url, v.is_bairrista, v.verificado,
            v.categoria_slug, v.categoria_nome, v.categoria_icone,
            v.bairro_slug, v.bairro_nome,
            t.dica_local, t.imagem_alt, t.idioma AS idioma_conteudo,
            ${hojeEmSaoPaulo}::text AS data
       FROM vw_lugares_resumo v
       JOIN LATERAL (
         SELECT tr.dica_local, tr.imagem_alt, tr.idioma
           FROM lugar_traducoes tr
          WHERE tr.lugar_id = v.id
            AND tr.idioma IN ($1, 'pt')
            AND tr.dica_local IS NOT NULL
          ORDER BY (tr.idioma = $1) DESC
          LIMIT 1
       ) t ON true
      WHERE v.is_bairrista
      ORDER BY md5(v.id::text || ${hojeEmSaoPaulo}::text)
      LIMIT 1`,
    [idioma],
  );
  return rows[0] ?? null;
}
