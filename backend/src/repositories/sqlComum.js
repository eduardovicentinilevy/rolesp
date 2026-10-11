// Trechos de SQL reaproveitados pelos repositories. São texto FIXO, escrito no código:
// nenhum valor do usuário entra aqui (valores sempre vão como parâmetros $n).

// Escolhe a melhor tradução de um lugar: a do idioma pedido; se não existir, a em português.
// LATERAL permite que a subconsulta use colunas da linha atual (v.id) — é um "for each".
// O fallback é da linha inteira: nunca mistura descrição em inglês com dica em português.
export const traducaoLugar = (paramIdioma, aliasLugar = 'v') => `
  LEFT JOIN LATERAL (
    SELECT tr.descricao, tr.dica_local, tr.imagem_alt, tr.horario_observacao, tr.idioma
      FROM lugar_traducoes tr
     WHERE tr.lugar_id = ${aliasLugar}.id
       AND tr.idioma IN (${paramIdioma}, 'pt')
     ORDER BY (tr.idioma = ${paramIdioma}) DESC
     LIMIT 1
  ) t ON true`;

// Tags do lugar como array JSON [{ slug, nome }], montado pelo próprio Postgres
export const tagsDoLugar = (aliasLugar = 'v') => `
  (SELECT coalesce(json_agg(json_build_object('slug', tg.slug, 'nome', tg.nome) ORDER BY tg.nome), '[]'::json)
     FROM lugar_tags lt
     JOIN tags tg ON tg.id = lt.tag_id
    WHERE lt.lugar_id = ${aliasLugar}.id)`;

// Colunas do card de lugar (view + tradução escolhida + tags)
export const colunasLugarResumo = `
  v.id, v.slug, v.nome, v.faixa_preco, v.is_bairrista, v.verificado,
  v.latitude, v.longitude, v.imagem_url,
  v.categoria_slug, v.categoria_nome, v.categoria_icone,
  v.bairro_slug, v.bairro_nome,
  v.media_notas, v.total_avaliacoes,
  t.descricao, t.dica_local, t.imagem_alt, t.idioma AS idioma_conteudo,
  ${tagsDoLugar('v')} AS tags`;

// Data de hoje no fuso de São Paulo (o servidor roda em UTC)
export const hojeEmSaoPaulo = `(now() AT TIME ZONE 'America/Sao_Paulo')::date`;
