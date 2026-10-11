-- 004: view de resumo dos lugares, com média e total de avaliações APROVADAS.
--
-- Pontos de atenção:
--   * o filtro de status fica no ON do LEFT JOIN, não no WHERE: no WHERE ele transformaria
--     o LEFT JOIN num INNER JOIN e os lugares sem avaliação sumiriam
--   * média NULL quando não há avaliação (mostrar "0 estrelas" seria mentir)
--   * GROUP BY l.id basta para as colunas de lugares: o Postgres reconhece a dependência
--     funcional da PK. c.id e b.id entram pelo mesmo motivo
--   * a view não depende de idioma: o repository junta lugar_traducoes conforme o ?lang=
--   * casts para float8/int: o driver pg devolve numeric e bigint como string
CREATE VIEW vw_lugares_resumo AS
SELECT
  l.id,
  l.slug,
  l.nome,
  l.faixa_preco,
  l.is_bairrista,
  l.verificado_em IS NOT NULL      AS verificado,
  l.verificado_em,
  l.endereco,
  l.latitude,
  l.longitude,
  l.imagem_url,
  l.imagem_credito,
  l.criado_em,
  l.atualizado_em,
  c.id                             AS categoria_id,
  c.slug                           AS categoria_slug,
  c.nome                           AS categoria_nome,
  c.icone                          AS categoria_icone,
  b.id                             AS bairro_id,
  b.slug                           AS bairro_slug,
  b.nome                           AS bairro_nome,
  ROUND(AVG(a.nota), 1)::float8    AS media_notas,
  COUNT(a.id)::int                 AS total_avaliacoes
FROM lugares l
JOIN categorias c ON c.id = l.categoria_id
JOIN bairros    b ON b.id = l.bairro_id
LEFT JOIN avaliacoes a
       ON a.lugar_id = l.id
      AND a.status = 'aprovada'
GROUP BY l.id, c.id, b.id;
