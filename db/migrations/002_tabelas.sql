-- 002: tabelas, constraints e triggers.
--
-- Convenções:
--   * PK integer GENERATED ALWAYS AS IDENTITY (padrão SQL; substitui o serial)
--   * slugs únicos com CHECK de formato; as URLs públicas usam slug, o admin usa id
--   * domínios fechados com CHECK (e não ENUM): alterar um CHECK é uma migration simples
--   * tudo que é texto editorial e traduzível fica em tabelas *_traducoes
--   * nomes de constraints explícitos: o middleware de erros da API usa esses nomes

-- ---------------------------------------------------------------------------
-- Idiomas: adicionar um idioma é um INSERT, não um ALTER TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE idiomas (
  codigo varchar(5)  PRIMARY KEY CONSTRAINT idiomas_codigo_formato CHECK (codigo ~ '^[a-z]{2}$'),
  nome   varchar(30) NOT NULL
);

-- ---------------------------------------------------------------------------
-- Administradores do painel
-- ---------------------------------------------------------------------------
CREATE TABLE admins (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email             varchar(254) NOT NULL
                    CONSTRAINT admins_email_formato CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  senha_hash        varchar(100) NOT NULL,                 -- bcrypt (60 caracteres)
  tentativas_falhas smallint     NOT NULL DEFAULT 0
                    CONSTRAINT admins_tentativas_nao_negativas CHECK (tentativas_falhas >= 0),
  bloqueado_ate     timestamptz,                           -- bloqueio por força bruta
  ultimo_login_em   timestamptz,
  criado_em         timestamptz  NOT NULL DEFAULT now()
);
-- e-mail único sem diferenciar maiúsculas: "Admin@x.com" e "admin@x.com" são a mesma conta
CREATE UNIQUE INDEX admins_email_unico ON admins (lower(email));

-- ---------------------------------------------------------------------------
-- Bairros
-- ---------------------------------------------------------------------------
CREATE TABLE bairros (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          varchar(80)  NOT NULL CONSTRAINT bairros_nome_nao_vazio CHECK (btrim(nome) <> ''),
  slug          varchar(90)  NOT NULL
                CONSTRAINT bairros_slug_unico UNIQUE
                CONSTRAINT bairros_slug_formato CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  zona          varchar(10)  NOT NULL
                CONSTRAINT bairros_zona_valida CHECK (zona IN ('centro', 'norte', 'sul', 'leste', 'oeste')),
  latitude      double precision,                          -- centro do bairro, para o mapa
  longitude     double precision,
  imagem_url    varchar(500) CONSTRAINT bairros_imagem_https CHECK (imagem_url ~* '^https://'),
  destaque      boolean      NOT NULL DEFAULT false,       -- aparece na home
  criado_em     timestamptz  NOT NULL DEFAULT now(),
  atualizado_em timestamptz  NOT NULL DEFAULT now(),
  -- latitude e longitude vêm juntas ou não vêm
  CONSTRAINT bairros_coordenadas_juntas CHECK ((latitude IS NULL) = (longitude IS NULL)),
  -- dentro da Grande SP: pega o erro clássico de inverter latitude e longitude
  CONSTRAINT bairros_coordenadas_grande_sp
    CHECK (latitude BETWEEN -24.1 AND -23.1 AND longitude BETWEEN -47.2 AND -45.7)
);

CREATE TABLE bairro_traducoes (
  bairro_id    integer    NOT NULL REFERENCES bairros (id) ON DELETE CASCADE,
  idioma       varchar(5) NOT NULL REFERENCES idiomas (codigo),
  descricao    varchar(500) NOT NULL CONSTRAINT bairro_traducoes_descricao_nao_vazia CHECK (btrim(descricao) <> ''),
  historia     text       CONSTRAINT bairro_traducoes_historia_tamanho CHECK (char_length(historia) <= 3000),
  curiosidades text[]     NOT NULL DEFAULT '{}'
               CONSTRAINT bairro_traducoes_curiosidades_max CHECK (cardinality(curiosidades) <= 10),
  PRIMARY KEY (bairro_id, idioma)
);

-- ---------------------------------------------------------------------------
-- Categorias e tags: vocabulário de interface, traduzido no i18next pelo slug.
-- O "nome" aqui é o texto em português e serve de fallback.
-- ---------------------------------------------------------------------------
CREATE TABLE categorias (
  id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug  varchar(60) NOT NULL
        CONSTRAINT categorias_slug_unico UNIQUE
        CONSTRAINT categorias_slug_formato CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome  varchar(60) NOT NULL,
  icone varchar(40) NOT NULL,
  ordem smallint    NOT NULL DEFAULT 0
);

CREATE TABLE tags (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug varchar(60) NOT NULL
       CONSTRAINT tags_slug_unico UNIQUE
       CONSTRAINT tags_slug_formato CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome varchar(60) NOT NULL
);

-- ---------------------------------------------------------------------------
-- Lugares
-- ---------------------------------------------------------------------------
CREATE TABLE lugares (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome           varchar(120) NOT NULL CONSTRAINT lugares_nome_nao_vazio CHECK (btrim(nome) <> ''),
  slug           varchar(140) NOT NULL
                 CONSTRAINT lugares_slug_unico UNIQUE
                 CONSTRAINT lugares_slug_formato CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- RESTRICT: não deixa apagar categoria ou bairro que ainda tem lugares
  categoria_id   integer NOT NULL REFERENCES categorias (id) ON DELETE RESTRICT,
  bairro_id      integer NOT NULL REFERENCES bairros (id) ON DELETE RESTRICT,
  endereco       varchar(200),                             -- NULL = a confirmar
  latitude       double precision,                         -- NULL = fora do mapa
  longitude      double precision,
  faixa_preco    smallint CONSTRAINT lugares_faixa_preco_valida CHECK (faixa_preco BETWEEN 1 AND 4),
  -- URLs só http(s): bloqueia "javascript:" e outros esquemas perigosos já no banco
  site           varchar(300) CONSTRAINT lugares_site_http CHECK (site ~* '^https?://'),
  instagram      varchar(30)  CONSTRAINT lugares_instagram_formato CHECK (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  imagem_url     varchar(500) CONSTRAINT lugares_imagem_https CHECK (imagem_url ~* '^https://'),
  imagem_credito varchar(200),                             -- atribuição exigida por licenças livres
  is_bairrista   boolean NOT NULL DEFAULT false,
  verificado_em  timestamptz,                              -- NULL = informação a confirmar
  -- busca pelo nome, sem stemming; coluna gerada: o Postgres mantém sozinho, sem trigger
  busca          tsvector GENERATED ALWAYS AS (to_tsvector('busca_simples', nome)) STORED,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lugares_coordenadas_juntas CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT lugares_coordenadas_grande_sp
    CHECK (latitude BETWEEN -24.1 AND -23.1 AND longitude BETWEEN -47.2 AND -45.7)
);

CREATE TABLE lugar_traducoes (
  lugar_id           integer    NOT NULL REFERENCES lugares (id) ON DELETE CASCADE,
  idioma             varchar(5) NOT NULL REFERENCES idiomas (codigo),
  descricao          text       NOT NULL
                     CONSTRAINT lugar_traducoes_descricao_tamanho CHECK (char_length(btrim(descricao)) BETWEEN 1 AND 2000),
  dica_local         text       CONSTRAINT lugar_traducoes_dica_tamanho CHECK (char_length(btrim(dica_local)) BETWEEN 1 AND 500),
  imagem_alt         varchar(200),                         -- texto alternativo traduzido
  horario_observacao varchar(200),                         -- ex.: "fecha em feriados"
  -- descrição pesa mais (A) que a dica (B) no ranking; a configuração depende do idioma da linha
  busca              tsvector GENERATED ALWAYS AS (
                       setweight(to_tsvector(fn_config_busca(idioma), descricao), 'A') ||
                       setweight(to_tsvector(fn_config_busca(idioma), coalesce(dica_local, '')), 'B')
                     ) STORED,
  PRIMARY KEY (lugar_id, idioma)
);

-- Uma linha por turno. Se fecha < abre, o turno passa da meia-noite (ex.: 23:00 -> 05:00).
-- 24 horas: abre 00:00 e fecha 24:00 (o tipo time do Postgres aceita 24:00).
CREATE TABLE lugar_horarios (
  lugar_id   integer  NOT NULL REFERENCES lugares (id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL
             CONSTRAINT lugar_horarios_dia_valido CHECK (dia_semana BETWEEN 0 AND 6), -- 0 = domingo, como EXTRACT(DOW)
  abre       time     NOT NULL,
  fecha      time     NOT NULL,
  -- a PK composta também serve de índice para buscar "os turnos do lugar X no dia Y"
  PRIMARY KEY (lugar_id, dia_semana, abre),
  CONSTRAINT lugar_horarios_turno_valido CHECK (abre <> fecha)
);

CREATE TABLE lugar_tags (
  lugar_id integer NOT NULL REFERENCES lugares (id) ON DELETE CASCADE,
  tag_id   integer NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (lugar_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Avaliações (LGPD: só apelido opcional, nota, comentário e idioma; sem e-mail, sem IP)
-- ---------------------------------------------------------------------------
CREATE TABLE avaliacoes (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lugar_id     integer     NOT NULL REFERENCES lugares (id) ON DELETE CASCADE,
  idioma       varchar(5)  NOT NULL REFERENCES idiomas (codigo),
  nome_autor   varchar(40) CONSTRAINT avaliacoes_nome_autor_nao_vazio CHECK (btrim(nome_autor) <> ''),
  nota         smallint    NOT NULL CONSTRAINT avaliacoes_nota_valida CHECK (nota BETWEEN 1 AND 5),
  comentario   text        CONSTRAINT avaliacoes_comentario_tamanho CHECK (char_length(btrim(comentario)) BETWEEN 1 AND 1000),
  status       varchar(10) NOT NULL DEFAULT 'pendente'
               CONSTRAINT avaliacoes_status_valido CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  moderado_em  timestamptz,
  -- SET NULL: se o admin for removido, o histórico da moderação continua
  moderado_por integer REFERENCES admins (id) ON DELETE SET NULL,
  -- consistência: pendente <=> ainda não moderada
  CONSTRAINT avaliacoes_moderacao_consistente CHECK ((status = 'pendente') = (moderado_em IS NULL))
);

-- ---------------------------------------------------------------------------
-- Roteiros
-- ---------------------------------------------------------------------------
CREATE TABLE roteiros (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug            varchar(140) NOT NULL
                  CONSTRAINT roteiros_slug_unico UNIQUE
                  CONSTRAINT roteiros_slug_formato CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  bairro_id       integer REFERENCES bairros (id) ON DELETE SET NULL, -- bairro principal (opcional)
  duracao_minutos integer NOT NULL
                  CONSTRAINT roteiros_duracao_valida CHECK (duracao_minutos BETWEEN 15 AND 1440),
  imagem_url      varchar(500) CONSTRAINT roteiros_imagem_https CHECK (imagem_url ~* '^https://'),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roteiro_traducoes (
  roteiro_id integer      NOT NULL REFERENCES roteiros (id) ON DELETE CASCADE,
  idioma     varchar(5)   NOT NULL REFERENCES idiomas (codigo),
  titulo     varchar(140) NOT NULL CONSTRAINT roteiro_traducoes_titulo_nao_vazio CHECK (btrim(titulo) <> ''),
  descricao  text         NOT NULL
             CONSTRAINT roteiro_traducoes_descricao_tamanho CHECK (char_length(btrim(descricao)) BETWEEN 1 AND 2000),
  PRIMARY KEY (roteiro_id, idioma)
);

CREATE TABLE roteiro_lugares (
  roteiro_id integer  NOT NULL REFERENCES roteiros (id) ON DELETE CASCADE,
  -- RESTRICT: um lugar que está num roteiro não pode ser apagado sem antes sair dele
  lugar_id   integer  NOT NULL REFERENCES lugares (id) ON DELETE RESTRICT,
  ordem      smallint NOT NULL CONSTRAINT roteiro_lugares_ordem_positiva CHECK (ordem > 0),
  PRIMARY KEY (roteiro_id, lugar_id),
  -- DEFERRABLE: a unicidade é checada no COMMIT, o que permite trocar posições numa transação
  CONSTRAINT roteiro_lugares_ordem_unica UNIQUE (roteiro_id, ordem) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE roteiro_lugar_traducoes (
  roteiro_id integer    NOT NULL,
  lugar_id   integer    NOT NULL,
  idioma     varchar(5) NOT NULL REFERENCES idiomas (codigo),
  observacao varchar(500) NOT NULL CONSTRAINT roteiro_lugar_traducoes_observacao_nao_vazia CHECK (btrim(observacao) <> ''),
  PRIMARY KEY (roteiro_id, lugar_id, idioma),
  -- FK composta: a observação pertence a uma parada específica do roteiro
  FOREIGN KEY (roteiro_id, lugar_id) REFERENCES roteiro_lugares (roteiro_id, lugar_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Triggers de atualizado_em
-- ---------------------------------------------------------------------------
CREATE TRIGGER bairros_atualizado_em
  BEFORE UPDATE ON bairros
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

CREATE TRIGGER lugares_atualizado_em
  BEFORE UPDATE ON lugares
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

CREATE TRIGGER roteiros_atualizado_em
  BEFORE UPDATE ON roteiros
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();
