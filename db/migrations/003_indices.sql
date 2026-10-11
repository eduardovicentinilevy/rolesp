-- 003: índices de desempenho.
-- PKs e UNIQUEs já criam índices sozinhas. FKs NÃO: o Postgres não indexa FK automaticamente.
--
-- O que ficou de fora de propósito: is_bairrista e faixa_preco têm pouquíssimos valores
-- distintos; um B-tree neles quase nunca seria escolhido pelo planner.

-- Filtros por categoria e bairro, e os JOINs da view
CREATE INDEX lugares_categoria_id_idx ON lugares (categoria_id);
CREATE INDEX lugares_bairro_id_idx    ON lugares (bairro_id);

-- Busca textual (GIN é o índice certo para tsvector: indexa cada lexema)
CREATE INDEX lugares_busca_idx         ON lugares         USING gin (busca);
CREATE INDEX lugar_traducoes_busca_idx ON lugar_traducoes USING gin (busca);

-- Filtro por tag: a PK (lugar_id, tag_id) só serve para buscar pelo lado do lugar
CREATE INDEX lugar_tags_tag_id_idx ON lugar_tags (tag_id, lugar_id);

-- Índices PARCIAIS: só guardam as linhas que as consultas realmente leem
-- página do lugar e view: avaliações aprovadas, das mais novas para as mais antigas
CREATE INDEX avaliacoes_aprovadas_idx ON avaliacoes (lugar_id, criado_em DESC) WHERE status = 'aprovada';
-- fila de moderação do painel
CREATE INDEX avaliacoes_pendentes_idx ON avaliacoes (criado_em) WHERE status = 'pendente';

-- Sem este índice, o RESTRICT do DELETE de um lugar varreria roteiro_lugares inteira
CREATE INDEX roteiro_lugares_lugar_id_idx ON roteiro_lugares (lugar_id);

-- O ON DELETE SET NULL de roteiros.bairro_id precisa achar os roteiros do bairro
CREATE INDEX roteiros_bairro_id_idx ON roteiros (bairro_id);
