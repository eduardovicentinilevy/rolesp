-- 005 · roteiros, roteiro_traducoes, roteiro_lugares

CREATE TABLE roteiros (
  id              integer GENERATED ALWAYS AS IDENTITY,
  slug            slug        NOT NULL,
  duracao_minutos smallint    NOT NULL,
  imagem_url      text,
  publicado       boolean     NOT NULL DEFAULT false,  -- rascunho até alguém publicar
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_roteiros PRIMARY KEY (id),
  CONSTRAINT uq_roteiros_slug UNIQUE (slug),
  CONSTRAINT ck_roteiros_duracao CHECK (duracao_minutos BETWEEN 15 AND 1440),
  CONSTRAINT ck_roteiros_imagem_https CHECK (imagem_url ~ '^https://[^[:space:]]+$' AND char_length(imagem_url) <= 500)
);

CREATE TRIGGER tg_roteiros_atualizado_em
  BEFORE UPDATE ON roteiros
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

CREATE TABLE roteiro_traducoes (
  roteiro_id integer NOT NULL,
  idioma     text    NOT NULL,
  titulo     text    NOT NULL,
  descricao  text,
  CONSTRAINT pk_roteiro_traducoes PRIMARY KEY (roteiro_id, idioma),
  CONSTRAINT fk_roteiro_traducoes_roteiro FOREIGN KEY (roteiro_id) REFERENCES roteiros (id) ON DELETE CASCADE,
  CONSTRAINT fk_roteiro_traducoes_idioma FOREIGN KEY (idioma) REFERENCES idiomas (codigo),
  CONSTRAINT ck_roteiro_traducoes_titulo CHECK (btrim(titulo) <> '' AND char_length(titulo) <= 120),
  CONSTRAINT ck_roteiro_traducoes_descricao CHECK (btrim(descricao) <> '' AND char_length(descricao) <= 2000)
);

-- Paradas do roteiro, em ordem
CREATE TABLE roteiro_lugares (
  roteiro_id integer     NOT NULL,
  lugar_id   integer     NOT NULL,
  ordem      smallint    NOT NULL,
  observacao rotulo_i18n,  -- dica curta da parada, ex.: {"pt": "Vá a pé pela Rua Direita", "en": "..."}
  -- o mesmo lugar não aparece duas vezes no mesmo roteiro
  CONSTRAINT pk_roteiro_lugares PRIMARY KEY (roteiro_id, lugar_id),
  CONSTRAINT fk_roteiro_lugares_roteiro FOREIGN KEY (roteiro_id) REFERENCES roteiros (id) ON DELETE CASCADE,
  -- RESTRICT: não dá para apagar um lugar que está num roteiro (o roteiro ficaria com um buraco)
  CONSTRAINT fk_roteiro_lugares_lugar FOREIGN KEY (lugar_id) REFERENCES lugares (id) ON DELETE RESTRICT,
  CONSTRAINT ck_roteiro_lugares_ordem CHECK (ordem >= 1),
  -- Duas paradas não ocupam a mesma posição. DEFERRABLE INITIALLY DEFERRED: a checagem
  -- fica para o COMMIT. Assim dá para trocar a ordem de duas paradas em dois UPDATEs
  -- dentro de uma transação, passando por um estado intermediário com posição repetida.
  CONSTRAINT uq_roteiro_lugares_ordem UNIQUE (roteiro_id, ordem) DEFERRABLE INITIALLY DEFERRED
);
