-- 001: extensões, configurações de busca textual, funções utilitárias e privilégios padrão.
-- Roda como rolesp_owner (dono do banco). O runner envolve cada arquivo numa transação.

-- unaccent é uma extensão "trusted": o dono do banco pode criá-la sem ser superusuário.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Configurações de busca com remoção de acento antes do stemming.
-- O unaccent é um dicionário "filtro": entrega a palavra sem acento para o próximo da lista.
-- Testado: sem o unaccent, "cafés" não vira o mesmo radical de "café".
CREATE TEXT SEARCH CONFIGURATION busca_pt (COPY = portuguese);
ALTER TEXT SEARCH CONFIGURATION busca_pt
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;

CREATE TEXT SEARCH CONFIGURATION busca_en (COPY = english);
ALTER TEXT SEARCH CONFIGURATION busca_en
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;

-- DE e FR já ficam prontos: basta cadastrar traduções nesses idiomas
CREATE TEXT SEARCH CONFIGURATION busca_de (COPY = german);
ALTER TEXT SEARCH CONFIGURATION busca_de
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, german_stem;

CREATE TEXT SEARCH CONFIGURATION busca_fr (COPY = french);
ALTER TEXT SEARCH CONFIGURATION busca_fr
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;

-- Sem stemming: para nomes próprios ("Bar do Zé" não deve virar radical)
CREATE TEXT SEARCH CONFIGURATION busca_simples (COPY = simple);
ALTER TEXT SEARCH CONFIGURATION busca_simples
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;

-- Escolhe a configuração de busca pelo código do idioma.
-- IMMUTABLE porque é usada em colunas geradas (o Postgres exige expressões imutáveis ali).
-- É a fonte única dessa regra: a coluna gerada e as consultas da API usam a mesma função.
CREATE FUNCTION fn_config_busca(idioma varchar)
RETURNS regconfig
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE idioma
    WHEN 'en' THEN 'busca_en'::regconfig
    WHEN 'de' THEN 'busca_de'::regconfig
    WHEN 'fr' THEN 'busca_fr'::regconfig
    ELSE 'busca_pt'::regconfig
  END
$$;

-- Trigger genérica: mantém atualizado_em em dia em qualquer UPDATE
CREATE FUNCTION fn_atualizar_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END
$$;

-- Menor privilégio: toda tabela e sequência que o dono criar daqui em diante
-- já nasce com DML liberado para o papel da API, e nada além disso (sem DDL).
-- Condicional para não quebrar em ambientes onde o papel ainda não existe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rolesp_app') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rolesp_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO rolesp_app;
  ELSE
    RAISE NOTICE 'papel rolesp_app não existe: privilégios padrão não configurados';
  END IF;
END
$$;
