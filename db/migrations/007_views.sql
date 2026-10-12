-- 007 · views

-- vw_lugares_resumo: tudo o que um card de lugar precisa, já traduzido.
-- Uma linha por lugar ATIVO x idioma ATIVO. A API filtra por "idioma = $1" e o Postgres
-- empurra esse filtro para dentro da view (ela é só uma consulta guardada, sem dados próprios).
CREATE VIEW vw_lugares_resumo AS
SELECT
  l.id,
  l.slug,
  l.nome,
  i.codigo                                        AS idioma,
  c.slug                                          AS categoria_slug,
  coalesce(c.nome ->> i.codigo, c.nome ->> 'pt')  AS categoria_nome,
  c.icone                                         AS categoria_icone,
  b.slug                                          AS bairro_slug,
  b.nome                                          AS bairro_nome,
  b.zona                                          AS bairro_zona,
  l.endereco,
  l.latitude,
  l.longitude,
  l.faixa_preco,
  l.imagem_url,
  l.is_bairrista,
  l.verificado,
  l.verificado_em,
  t.descricao,
  t.dica_local,
  -- idioma em que o texto realmente veio (o front marca <p lang="pt"> quando caiu no fallback)
  t.idioma                                        AS idioma_conteudo,
  coalesce(t.idioma = i.codigo, false)            AS traducao_disponivel,
  coalesce(tg.tags, '[]'::jsonb)                  AS tags,       -- [{"slug": ..., "nome": ...}]
  coalesce(tg.tag_slugs, '{}'::text[])            AS tag_slugs,  -- para filtrar: tag_slugs @> '{a,b}'
  n.nota_media,                                                  -- NULL = ainda sem avaliação aprovada
  coalesce(n.total_avaliacoes, 0)                 AS total_avaliacoes,
  l.criado_em,
  l.atualizado_em,
  -- Documento de busca da linha:
  --   nome no stemmer do idioma (A) + nome sem stemming (A, coluna gerada em lugares)
  --   + descrição (B) e dica (C) da tradução exibida + nome do bairro (D).
  -- O nome entra também no idioma porque o stemmer não é perfeito: em português,
  -- "museu" vira "mus", mas "museus" continua "museus" (limitação documentada no README).
  setweight(to_tsvector(fn_config_busca(i.codigo), l.nome), 'A')
    || l.busca_nome
    || coalesce(t.busca, ''::tsvector)
    || setweight(to_tsvector('simples_sem_acento'::regconfig, b.nome), 'D')
                                                  AS busca
FROM lugares l
CROSS JOIN idiomas i
JOIN categorias c ON c.id = l.categoria_id
JOIN bairros b    ON b.id = l.bairro_id
-- Tradução no idioma pedido; se não houver, a de PT. A linha inteira (descrição e dica)
-- vem do MESMO idioma, para não misturar descrição em inglês com dica em português.
LEFT JOIN LATERAL (
  SELECT tr.idioma, tr.descricao, tr.dica_local, tr.busca
    FROM lugar_traducoes tr
   WHERE tr.lugar_id = l.id
     AND tr.idioma IN (i.codigo, 'pt')
   ORDER BY (tr.idioma = i.codigo) DESC
   LIMIT 1
) t ON true
-- Notas agregadas ANTES do join: uma linha por lugar. Se o GROUP BY viesse depois de
-- juntar as tags, cada avaliação apareceria repetida uma vez por tag e o total sairia errado.
-- Só as aprovadas contam: pendentes e rejeitadas não entram na média.
LEFT JOIN (
  SELECT a.lugar_id,
         round(avg(a.nota), 1) AS nota_media,
         count(*)              AS total_avaliacoes
    FROM avaliacoes a
   WHERE a.status = 'aprovada'
   GROUP BY a.lugar_id
) n ON n.lugar_id = l.id
-- Tags também agregadas por lugar (LATERAL porque o nome depende do idioma da linha)
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
           jsonb_build_object('slug', tg.slug, 'nome', coalesce(tg.nome ->> i.codigo, tg.nome ->> 'pt'))
           ORDER BY coalesce(tg.nome ->> i.codigo, tg.nome ->> 'pt') COLLATE pt_br
         )                                       AS tags,
         array_agg(tg.slug::text ORDER BY tg.slug) AS tag_slugs
    FROM lugar_tags lt
    JOIN tags tg ON tg.id = lt.tag_id
   WHERE lt.lugar_id = l.id
) tg ON true
WHERE l.ativo
  AND i.ativo;

COMMENT ON VIEW vw_lugares_resumo IS
  'Card do lugar: uma linha por lugar ativo x idioma ativo, com textos traduzidos (fallback PT), tags, nota média das avaliações aprovadas e o tsvector de busca.';

-- vw_pendencias_conteudo: o que falta preencher em cada lugar ativo (painel do admin).
-- Lugar completo aparece com a lista vazia.
CREATE VIEW vw_pendencias_conteudo AS
SELECT
  l.id,
  l.slug,
  l.nome,
  p.pendencias,
  cardinality(p.pendencias) AS total_pendencias,
  l.atualizado_em
FROM lugares l
CROSS JOIN LATERAL (
  SELECT
    -- array_remove tira os NULLs dos CASE que não se aplicam
    array_remove(ARRAY[
      CASE WHEN NOT l.verificado        THEN 'nao_verificado'  END,
      CASE WHEN l.endereco IS NULL      THEN 'sem_endereco'    END,
      CASE WHEN l.latitude IS NULL      THEN 'sem_coordenadas' END,
      CASE WHEN l.imagem_url IS NULL    THEN 'sem_imagem'      END
    ], NULL)
    -- uma pendência por idioma ATIVO sem tradução (ativar DE já faz "sem_traducao_de" aparecer)
    || coalesce((
         SELECT array_agg('sem_traducao_' || i.codigo ORDER BY i.codigo)
           FROM idiomas i
          WHERE i.ativo
            AND NOT EXISTS (
              SELECT 1 FROM lugar_traducoes tr
               WHERE tr.lugar_id = l.id AND tr.idioma = i.codigo
            )
       ), '{}'::text[]) AS pendencias
) p
WHERE l.ativo;

COMMENT ON VIEW vw_pendencias_conteudo IS
  'Pendências de conteúdo por lugar ativo: nao_verificado, sem_endereco, sem_coordenadas, sem_imagem, sem_traducao_<idioma ativo>.';
