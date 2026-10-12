-- 002 · idiomas, bairros, bairro_traducoes, categorias

-- Idiomas do site. É uma tabela referenciada por FK, e não um CHECK (idioma IN (...)),
-- para que ativar DE ou FR seja só um UPDATE em dados, sem migration nova.
CREATE TABLE idiomas (
  codigo text    NOT NULL,
  nome   text    NOT NULL,  -- no próprio idioma: "Deutsch", "Français"
  ativo  boolean NOT NULL DEFAULT false,
  CONSTRAINT pk_idiomas PRIMARY KEY (codigo),
  CONSTRAINT ck_idiomas_codigo CHECK (codigo ~ '^[a-z]{2}$'),
  CONSTRAINT ck_idiomas_nome CHECK (btrim(nome) <> '')
);

CREATE TABLE bairros (
  id            integer GENERATED ALWAYS AS IDENTITY,
  slug          slug         NOT NULL,
  nome          text COLLATE pt_br NOT NULL,
  zona          text         NOT NULL,
  -- numeric(9,6): 6 casas decimais são ~10 cm de precisão, e o valor é exato (float não é)
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  criado_em     timestamptz  NOT NULL DEFAULT now(),
  atualizado_em timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT pk_bairros PRIMARY KEY (id),
  CONSTRAINT uq_bairros_slug UNIQUE (slug),
  CONSTRAINT ck_bairros_nome CHECK (btrim(nome) <> '' AND char_length(nome) <= 100),
  CONSTRAINT ck_bairros_zona CHECK (zona IN ('centro', 'norte', 'sul', 'leste', 'oeste')),
  -- "(a IS NULL) = (b IS NULL)" nunca dá NULL: ou as duas coordenadas existem, ou nenhuma
  CONSTRAINT ck_bairros_coordenadas_par CHECK ((latitude IS NULL) = (longitude IS NULL)),
  -- caixa em volta da Grande São Paulo: pega latitude e longitude trocadas ou sem o sinal
  CONSTRAINT ck_bairros_coordenadas_sp CHECK (
    latitude BETWEEN -24.1 AND -23.1 AND longitude BETWEEN -47.2 AND -45.7
  )
);

CREATE TRIGGER tg_bairros_atualizado_em
  BEFORE UPDATE ON bairros
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

-- Textos longos traduzidos ficam numa tabela à parte: uma linha por bairro e idioma.
CREATE TABLE bairro_traducoes (
  bairro_id   integer NOT NULL,
  idioma      text    NOT NULL,
  descricao   text    NOT NULL,
  curiosidade text,
  CONSTRAINT pk_bairro_traducoes PRIMARY KEY (bairro_id, idioma),
  -- a tradução não existe sem o bairro: apagou o bairro, apagam-se as traduções
  CONSTRAINT fk_bairro_traducoes_bairro FOREIGN KEY (bairro_id)
    REFERENCES bairros (id) ON DELETE CASCADE,
  CONSTRAINT fk_bairro_traducoes_idioma FOREIGN KEY (idioma) REFERENCES idiomas (codigo),
  CONSTRAINT ck_bairro_traducoes_descricao CHECK (btrim(descricao) <> '' AND char_length(descricao) <= 2000),
  CONSTRAINT ck_bairro_traducoes_curiosidade CHECK (btrim(curiosidade) <> '' AND char_length(curiosidade) <= 600)
);

CREATE TABLE categorias (
  id     integer GENERATED ALWAYS AS IDENTITY,
  slug   slug        NOT NULL,
  nome   rotulo_i18n NOT NULL,  -- {"pt": "Bares", "en": "Bars", ...}
  icone  text        NOT NULL,  -- nome do ícone no front (ex.: "copo")
  ordem  smallint    NOT NULL DEFAULT 0,  -- ordem de exibição nos menus
  CONSTRAINT pk_categorias PRIMARY KEY (id),
  CONSTRAINT uq_categorias_slug UNIQUE (slug),
  CONSTRAINT ck_categorias_icone CHECK (icone ~ '^[a-z0-9-]{1,40}$'),
  CONSTRAINT ck_categorias_ordem CHECK (ordem >= 0)
);

COMMENT ON TABLE idiomas IS 'Idiomas do site. ativo = aparece no seletor e na vw_lugares_resumo.';
COMMENT ON COLUMN bairros.nome IS 'Nome próprio, igual em todos os idiomas. Collation pt_br para ordenar com acento.';
COMMENT ON COLUMN categorias.nome IS 'Rótulo traduzido (rotulo_i18n). A chave "pt" é obrigatória e serve de fallback.';
