-- 004 · admins e avaliacoes

CREATE TABLE admins (
  id              integer GENERATED ALWAYS AS IDENTITY,
  nome            text        NOT NULL,
  email           text        NOT NULL,
  senha_hash      text        NOT NULL,
  ativo           boolean     NOT NULL DEFAULT true,  -- false revoga o acesso na hora (fase 4)
  ultimo_login_em timestamptz,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_admins PRIMARY KEY (id),
  CONSTRAINT ck_admins_nome CHECK (btrim(nome) <> '' AND char_length(nome) <= 100),
  CONSTRAINT ck_admins_email CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND char_length(email) <= 254),
  -- Formato de hash bcrypt: $2a$, $2b$ ou $2y$, custo com 2 dígitos e 53 caracteres.
  -- Barra senha em texto puro gravada por engano (um bug no código ou um INSERT manual).
  CONSTRAINT ck_admins_senha_bcrypt CHECK (senha_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$')
);

-- E-mail único sem diferenciar maiúsculas: "Ana@x.com" e "ana@x.com" são a mesma pessoa.
-- É um índice único sobre lower(email), porque uma constraint UNIQUE só aceita colunas.
CREATE UNIQUE INDEX uq_admins_email ON admins (lower(email));

CREATE TRIGGER tg_admins_atualizado_em
  BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

-- LGPD: a avaliação guarda só o necessário para ser exibida. Sem e-mail e sem IP.
-- O nome do autor é o que a pessoa quiser mostrar (pode ser um apelido).
CREATE TABLE avaliacoes (
  id           bigint      GENERATED ALWAYS AS IDENTITY,
  lugar_id     integer     NOT NULL,
  nome_autor   text        NOT NULL,
  nota         smallint    NOT NULL,
  comentario   text,
  idioma       text        NOT NULL,  -- idioma em que o comentário foi escrito
  status       text        NOT NULL DEFAULT 'pendente',
  moderado_por integer,
  moderado_em  timestamptz,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_avaliacoes PRIMARY KEY (id),
  -- se um lugar for apagado de verdade (raro: o normal é ativo = false), as avaliações vão junto
  CONSTRAINT fk_avaliacoes_lugar FOREIGN KEY (lugar_id) REFERENCES lugares (id) ON DELETE CASCADE,
  CONSTRAINT fk_avaliacoes_idioma FOREIGN KEY (idioma) REFERENCES idiomas (codigo),
  -- se o admin for apagado, a moderação continua valendo; só perde o "quem"
  CONSTRAINT fk_avaliacoes_moderado_por FOREIGN KEY (moderado_por)
    REFERENCES admins (id) ON DELETE SET NULL,
  CONSTRAINT ck_avaliacoes_nome_autor CHECK (char_length(btrim(nome_autor)) BETWEEN 2 AND 60),
  CONSTRAINT ck_avaliacoes_nota CHECK (nota BETWEEN 1 AND 5),
  CONSTRAINT ck_avaliacoes_comentario CHECK (btrim(comentario) <> '' AND char_length(comentario) <= 1000),
  CONSTRAINT ck_avaliacoes_status CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
  -- Pendente <=> ainda não moderada. Aprovar ou rejeitar exige a data.
  -- A regra usa moderado_em, e não moderado_por, porque moderado_por vira NULL se o admin sair.
  CONSTRAINT ck_avaliacoes_moderacao CHECK ((status = 'pendente') = (moderado_em IS NULL))
);

COMMENT ON TABLE avaliacoes IS 'Avaliações de visitantes. Nascem pendentes; só as aprovadas aparecem e entram na média. LGPD: sem e-mail e sem IP.';
