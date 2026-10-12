-- 001 · Infraestrutura: extensão, collation, domínios, configurações e funções de busca,
-- função de trigger. Nada aqui guarda dado; é a "caixa de ferramentas" das próximas migrations.

-- unaccent tira acentos ("café" -> "cafe"). É uma extensão "trusted": o dono do banco
-- consegue criá-la sem ser superusuário (vale também no Cloud SQL).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Collation ICU para português do Brasil. Sem ela, o ORDER BY usa a ordem do sistema
-- operacional do servidor, que varia de máquina para máquina e pode jogar "Ávila" para o fim.
-- Depende dos dados completos do ICU: por isso a imagem Debian, e não a alpine.
CREATE COLLATION pt_br (provider = icu, locale = 'pt-BR');

-- -----------------------------------------------------------------------------
-- Domínios: um tipo com a regra embutida. A regra fica escrita uma vez só e vale para
-- toda coluna que usar o tipo.
-- -----------------------------------------------------------------------------

-- Identificador amigável para URL: minúsculas, números e hífens simples ("museu-do-ipiranga").
CREATE DOMAIN slug AS varchar(120)
  CONSTRAINT ck_slug_formato CHECK (VALUE ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Texto curto traduzido, num jsonb: {"pt": "Bares", "en": "Bars"}.
-- Serve para rótulos pequenos (categorias, tags, observações), onde uma tabela de tradução
-- seria pesada demais. O "pt" é obrigatório porque é o idioma de fallback.
-- Atenção: CHECK que resulta em NULL é aprovado. Por isso o "VALUE ? 'pt'" vem primeiro:
-- ele dá false (e não NULL) quando a chave falta. Um NULL de verdade (coluna opcional) passa.
CREATE DOMAIN rotulo_i18n AS jsonb
  CONSTRAINT ck_rotulo_i18n_objeto CHECK (jsonb_typeof(VALUE) = 'object')
  CONSTRAINT ck_rotulo_i18n_pt CHECK (
    VALUE ? 'pt'
    AND jsonb_typeof(VALUE -> 'pt') = 'string'
    AND btrim(VALUE ->> 'pt') <> ''
  )
  -- todos os valores precisam ser texto (nada de {"en": 123})
  CONSTRAINT ck_rotulo_i18n_textos CHECK (NOT (VALUE @? '$.* ? (@.type() != "string")'));

-- -----------------------------------------------------------------------------
-- Busca textual sem acento
-- -----------------------------------------------------------------------------
-- Cada configuração é uma cópia da padrão do idioma, com o unaccent rodando ANTES do stemmer.
-- O unaccent é um dicionário "filtro": tira o acento e passa a palavra adiante.
-- Assim "cafés" e "cafes" viram o mesmo radical.
-- (hword, hword_part e word são os tokens com letras não ASCII; asciiword já não tem acento.)
CREATE TEXT SEARCH CONFIGURATION pt_sem_acento (COPY = pg_catalog.portuguese);
ALTER TEXT SEARCH CONFIGURATION pt_sem_acento
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;

CREATE TEXT SEARCH CONFIGURATION en_sem_acento (COPY = pg_catalog.english);
ALTER TEXT SEARCH CONFIGURATION en_sem_acento
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;

CREATE TEXT SEARCH CONFIGURATION de_sem_acento (COPY = pg_catalog.german);
ALTER TEXT SEARCH CONFIGURATION de_sem_acento
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, german_stem;

CREATE TEXT SEARCH CONFIGURATION fr_sem_acento (COPY = pg_catalog.french);
ALTER TEXT SEARCH CONFIGURATION fr_sem_acento
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;

-- Sem stemmer: para nomes próprios ("Copan" não deve virar radical de nada).
CREATE TEXT SEARCH CONFIGURATION simples_sem_acento (COPY = pg_catalog.simple);
ALTER TEXT SEARCH CONFIGURATION simples_sem_acento
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;

-- Código do idioma -> configuração de busca.
-- Precisa ser IMMUTABLE porque é usada em colunas GERADAS, e o Postgres só aceita
-- funções imutáveis ali (o valor gravado não pode depender de quando foi calculado).
-- Corpo no padrão SQL (RETURN ...): é analisado na criação, então o Postgres grava a
-- dependência das configurações e não deixa apagá-las enquanto a função existir.
-- Idioma sem configuração própria cai na simples: busca sem stemming, mas funciona.
CREATE FUNCTION fn_config_busca(p_idioma text)
RETURNS regconfig
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURN CASE p_idioma
  WHEN 'pt' THEN 'pt_sem_acento'::regconfig
  WHEN 'en' THEN 'en_sem_acento'::regconfig
  WHEN 'de' THEN 'de_sem_acento'::regconfig
  WHEN 'fr' THEN 'fr_sem_acento'::regconfig
  ELSE 'simples_sem_acento'::regconfig
END;

-- Transforma o texto digitado pelo usuário numa tsquery. Junta três consultas com OU:
--   1. websearch_to_tsquery no idioma da página: entende "frase exata", OR e -palavra,
--      e nunca dá erro de sintaxe, seja qual for o texto;
--   2. websearch_to_tsquery na configuração simples: acha nomes próprios sem stemming;
--   3. busca por prefixo: "ibira" acha "Ibirapuera".
-- As palavras com "-" na frente excluem resultados nas três consultas (veja o passo 4).
-- Devolve NULL quando não sobra nada pesquisável (texto vazio, só pontuação etc.).
-- STABLE, e não IMMUTABLE, porque unaccent() depende do dicionário instalado.
CREATE FUNCTION fn_tsquery_busca(p_texto text, p_idioma text DEFAULT 'pt')
RETURNS tsquery
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
-- websearch_to_tsquery avisa (NOTICE) quando o texto só tem stopwords ("de", "the").
-- Aqui isso é normal; o aviso só poluiria o log.
SET client_min_messages = warning
AS $$
DECLARE
  v_config   regconfig := fn_config_busca(coalesce(p_idioma, 'pt'));
  v_texto    text      := btrim(p_texto);
  v_resultado tsquery;
  v_prefixos tsquery;
  v_exclusoes tsquery;
  v_token    text;
  v_termo    text;
BEGIN
  IF v_texto IS NULL OR v_texto = '' THEN
    RETURN NULL;
  END IF;

  -- 1 e 2: consultas completas, no idioma e sem stemming
  v_resultado := websearch_to_tsquery(v_config, v_texto)
              || websearch_to_tsquery('simples_sem_acento', v_texto);

  -- 3 e 4: prefixos e exclusões, montados palavra por palavra.
  -- Cada palavra é reduzida a [a-z0-9] ANTES de virar tsquery. Assim nenhum operador
  -- (&, |, !, :*, parênteses) digitado pelo usuário chega ao to_tsquery.
  FOREACH v_token IN ARRAY regexp_split_to_array(lower(public.unaccent(v_texto)), '\s+') LOOP
    IF left(v_token, 1) = '-' THEN
      -- palavra excluída: vale para todas as consultas, no idioma e sem stemming
      v_termo := substring(v_token FROM '^-+([a-z0-9]+)');
      IF v_termo IS NOT NULL AND length(v_termo) >= 3 THEN
        v_exclusoes := coalesce(v_exclusoes || to_tsquery(v_config, v_termo), to_tsquery(v_config, v_termo))
                    || to_tsquery('simples_sem_acento', v_termo);
      END IF;
    ELSE
      -- "café-da-manhã" vira três termos; só entram os de 3 letras ou mais
      FOR v_termo IN SELECT m[1] FROM regexp_matches(v_token, '[a-z0-9]+', 'g') AS m LOOP
        IF length(v_termo) >= 3 THEN
          v_prefixos := coalesce(v_prefixos && to_tsquery('simples_sem_acento', v_termo || ':*'),
                                 to_tsquery('simples_sem_acento', v_termo || ':*'));
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF v_prefixos IS NOT NULL THEN
    v_resultado := v_resultado || v_prefixos;
  END IF;

  -- A exclusão vai por FORA do OU. Se ficasse só dentro de cada consulta, um lugar podia
  -- escapar por outra: em "parque -lago", a consulta simples procura "lago", mas a descrição
  -- foi indexada com o stemmer ("lag") e o lugar voltaria nos resultados.
  IF v_exclusoes IS NOT NULL THEN
    v_resultado := v_resultado && !! v_exclusoes;
  END IF;

  -- Sem nenhum termo pesquisável: NULL. Quem chama decide o que fazer (a API devolve lista vazia).
  IF numnode(v_resultado) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN v_resultado;
END
$$;

-- Função de trigger genérica: mantém atualizado_em em dia a cada UPDATE.
-- now() é o início da transação: todas as linhas alteradas juntas recebem o mesmo horário.
CREATE FUNCTION fn_atualizar_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END
$$;
