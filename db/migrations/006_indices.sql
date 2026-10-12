-- 006 · índices
-- O Postgres cria índice sozinho para PRIMARY KEY e UNIQUE, mas NÃO para FOREIGN KEY.
-- Sem índice na coluna da FK:
--   - o JOIN pelo lado "filho" vira leitura da tabela inteira;
--   - apagar (ou mudar a chave de) uma linha "pai" obriga o banco a varrer a tabela filha
--     inteira para checar a FK, segurando lock enquanto isso.
-- Regra do projeto: toda FK tem índice começando pelas colunas dela. Quando a PK já começa
-- pela coluna da FK (ex.: lugar_traducoes (lugar_id, idioma)), ela mesma serve.
-- O teste db/testes/constraints.sql confere essa regra no catálogo.

-- bairro_traducoes.bairro_id: coberta pela PK (bairro_id, idioma)
CREATE INDEX ix_bairro_traducoes_idioma ON bairro_traducoes (idioma);

CREATE INDEX ix_lugares_categoria ON lugares (categoria_id);
CREATE INDEX ix_lugares_bairro ON lugares (bairro_id);

-- lugar_traducoes.lugar_id: coberta pela PK (lugar_id, idioma)
CREATE INDEX ix_lugar_traducoes_idioma ON lugar_traducoes (idioma);

-- lugar_tags.lugar_id: coberta pela PK (lugar_id, tag_id).
-- O inverso (tag -> lugares) serve o filtro por tag.
CREATE INDEX ix_lugar_tags_tag ON lugar_tags (tag_id, lugar_id);

CREATE INDEX ix_avaliacoes_lugar ON avaliacoes (lugar_id);
CREATE INDEX ix_avaliacoes_idioma ON avaliacoes (idioma);
CREATE INDEX ix_avaliacoes_moderado_por ON avaliacoes (moderado_por);

-- roteiro_traducoes.roteiro_id: coberta pela PK (roteiro_id, idioma)
CREATE INDEX ix_roteiro_traducoes_idioma ON roteiro_traducoes (idioma);

-- roteiro_lugares.roteiro_id: coberta pela PK (roteiro_id, lugar_id)
CREATE INDEX ix_roteiro_lugares_lugar ON roteiro_lugares (lugar_id);

-- -----------------------------------------------------------------------------
-- Índices parciais: indexam só as linhas que a consulta realmente procura.
-- Ficam menores e mais rápidos que um índice da tabela inteira.
-- -----------------------------------------------------------------------------

-- "Dica bairrista do dia" e filtro bairrista=true
CREATE INDEX ix_lugares_bairristas_ativos ON lugares (bairro_id)
  WHERE is_bairrista AND ativo;

-- Avaliações exibidas no site: as aprovadas de um lugar, das mais novas para as mais antigas
CREATE INDEX ix_avaliacoes_aprovadas ON avaliacoes (lugar_id, criado_em DESC)
  WHERE status = 'aprovada';

-- Fila de moderação: as pendentes, das mais antigas para as mais novas
CREATE INDEX ix_avaliacoes_pendentes ON avaliacoes (criado_em)
  WHERE status = 'pendente';

-- -----------------------------------------------------------------------------
-- GIN nas colunas tsvector: o índice invertido do full-text search
-- (palavra -> linhas que a contêm), usado pelo operador @@.
-- -----------------------------------------------------------------------------
CREATE INDEX ix_lugares_busca_nome ON lugares USING gin (busca_nome);
CREATE INDEX ix_lugar_traducoes_busca ON lugar_traducoes USING gin (busca);
