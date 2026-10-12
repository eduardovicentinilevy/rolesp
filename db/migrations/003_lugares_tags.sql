-- 003 · lugares, lugar_traducoes, tags, lugar_tags

CREATE TABLE lugares (
  id            integer GENERATED ALWAYS AS IDENTITY,
  slug          slug         NOT NULL,
  nome          text COLLATE pt_br NOT NULL,
  categoria_id  integer      NOT NULL,
  bairro_id     integer      NOT NULL,
  -- Dados que mudam com o tempo ficam NULL até alguém conferir (NULL = "não informado")
  endereco      text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  faixa_preco   smallint,     -- 1 a 4 ($ a $$$$)
  -- {"seg": ["11:00-15:00", "18:00-23:00"], "dom": [], "feriados": ["12:00-16:00"]}
  -- lista vazia = fechado no dia; chave ausente = não informado
  horario_funcionamento jsonb,
  site          text,
  instagram     text,         -- só o usuário, sem @ e sem URL
  imagem_url    text,
  is_bairrista  boolean      NOT NULL DEFAULT false,
  verificado    boolean      NOT NULL DEFAULT false,
  verificado_em timestamptz,
  ativo         boolean      NOT NULL DEFAULT true,  -- exclusão lógica
  criado_em     timestamptz  NOT NULL DEFAULT now(),
  atualizado_em timestamptz  NOT NULL DEFAULT now(),
  -- Nome indexado sem stemming e sem acento, com peso A (o mais alto).
  -- Coluna GERADA: o Postgres recalcula sozinho a cada INSERT/UPDATE; ninguém esquece de atualizar.
  busca_nome    tsvector GENERATED ALWAYS AS (
                  setweight(to_tsvector('simples_sem_acento'::regconfig, nome), 'A')
                ) STORED,
  CONSTRAINT pk_lugares PRIMARY KEY (id),
  CONSTRAINT uq_lugares_slug UNIQUE (slug),
  CONSTRAINT fk_lugares_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id),
  -- sem ON DELETE: apagar um bairro que ainda tem lugares é recusado (RESTRICT implícito)
  CONSTRAINT fk_lugares_bairro FOREIGN KEY (bairro_id) REFERENCES bairros (id),
  CONSTRAINT ck_lugares_nome CHECK (btrim(nome) <> '' AND char_length(nome) <= 120),
  CONSTRAINT ck_lugares_endereco CHECK (btrim(endereco) <> '' AND char_length(endereco) <= 200),
  CONSTRAINT ck_lugares_coordenadas_par CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT ck_lugares_coordenadas_sp CHECK (
    latitude BETWEEN -24.1 AND -23.1 AND longitude BETWEEN -47.2 AND -45.7
  ),
  CONSTRAINT ck_lugares_faixa_preco CHECK (faixa_preco BETWEEN 1 AND 4),
  -- Só as chaves seg..dom e feriados. "jsonb - text[]" remove essas chaves;
  -- se sobrar alguma coisa, é chave inválida.
  CONSTRAINT ck_lugares_horario_dias CHECK (
    horario_funcionamento IS NULL OR (
      jsonb_typeof(horario_funcionamento) = 'object'
      AND horario_funcionamento - ARRAY['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom', 'feriados'] = '{}'::jsonb
    )
  ),
  -- Cada dia é uma lista de faixas "HH:MM-HH:MM" (24:00 vale como fim do dia).
  -- jsonpath: "existe algum dia que não é lista, ou alguma faixa fora do formato?"
  CONSTRAINT ck_lugares_horario_faixas CHECK (
    NOT (horario_funcionamento @? '$.* ? (@.type() != "array")')
    AND NOT (horario_funcionamento @? '$.*[*] ? (!(@ like_regex "^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$|^([01][0-9]|2[0-3]):[0-5][0-9]-24:00$"))')
  ),
  -- só https: link http pode ser interceptado e a página mostraria "conteúdo misto"
  CONSTRAINT ck_lugares_site_https CHECK (site ~ '^https://[^[:space:]]+$' AND char_length(site) <= 300),
  CONSTRAINT ck_lugares_imagem_https CHECK (imagem_url ~ '^https://[^[:space:]]+$' AND char_length(imagem_url) <= 500),
  -- regra do Instagram: até 30 caracteres, letras, números, ponto e sublinhado
  CONSTRAINT ck_lugares_instagram CHECK (instagram ~ '^[a-z0-9._]{1,30}$'),
  -- "verificado" sem data não diz nada: quando foi conferido?
  CONSTRAINT ck_lugares_verificado_data CHECK (NOT verificado OR verificado_em IS NOT NULL)
);

CREATE TRIGGER tg_lugares_atualizado_em
  BEFORE UPDATE ON lugares
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

CREATE TABLE lugar_traducoes (
  lugar_id   integer NOT NULL,
  idioma     text    NOT NULL,
  descricao  text    NOT NULL,
  dica_local text,   -- "dica de local", escrita como um morador falaria
  -- Texto indexado no idioma da própria linha: descrição com peso B, dica com peso C.
  -- fn_config_busca é IMMUTABLE justamente para poder aparecer aqui.
  busca      tsvector GENERATED ALWAYS AS (
               setweight(to_tsvector(fn_config_busca(idioma), descricao), 'B')
               || setweight(to_tsvector(fn_config_busca(idioma), coalesce(dica_local, '')), 'C')
             ) STORED,
  CONSTRAINT pk_lugar_traducoes PRIMARY KEY (lugar_id, idioma),
  CONSTRAINT fk_lugar_traducoes_lugar FOREIGN KEY (lugar_id) REFERENCES lugares (id) ON DELETE CASCADE,
  CONSTRAINT fk_lugar_traducoes_idioma FOREIGN KEY (idioma) REFERENCES idiomas (codigo),
  CONSTRAINT ck_lugar_traducoes_descricao CHECK (btrim(descricao) <> '' AND char_length(descricao) <= 2000),
  CONSTRAINT ck_lugar_traducoes_dica CHECK (btrim(dica_local) <> '' AND char_length(dica_local) <= 600)
);

CREATE TABLE tags (
  id    integer GENERATED ALWAYS AS IDENTITY,
  slug  slug        NOT NULL,
  nome  rotulo_i18n NOT NULL,
  CONSTRAINT pk_tags PRIMARY KEY (id),
  CONSTRAINT uq_tags_slug UNIQUE (slug)
);

-- N:N entre lugares e tags
CREATE TABLE lugar_tags (
  lugar_id integer NOT NULL,
  tag_id   integer NOT NULL,
  CONSTRAINT pk_lugar_tags PRIMARY KEY (lugar_id, tag_id),
  CONSTRAINT fk_lugar_tags_lugar FOREIGN KEY (lugar_id) REFERENCES lugares (id) ON DELETE CASCADE,
  -- apagar uma tag em uso é recusado: tire a tag dos lugares antes
  CONSTRAINT fk_lugar_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id)
);

COMMENT ON COLUMN lugares.verificado IS 'false = o front mostra "informação a confirmar".';
COMMENT ON COLUMN lugares.ativo IS 'Exclusão lógica: false some do site, mas o histórico (avaliações, roteiros) continua no banco.';
COMMENT ON COLUMN lugares.horario_funcionamento IS 'Chaves seg..dom e feriados; cada uma é uma lista de faixas "HH:MM-HH:MM". Lista vazia = fechado.';
