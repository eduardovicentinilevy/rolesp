#!/usr/bin/env bash
# Cria os papéis e os bancos do Rolê SP.
#
# Roda sozinho na primeira subida do container (pasta docker-entrypoint-initdb.d)
# e também no CI, apontando PGHOST/PGUSER/PGPASSWORD para o servidor.
#
# Menor privilégio:
#   rolesp_owner -> dono dos bancos; roda migrations e seeds (DDL)
#   rolesp_app   -> usado pela API; recebe só SELECT/INSERT/UPDATE/DELETE
#                   (via ALTER DEFAULT PRIVILEGES na migration 001)
set -euo pipefail

: "${ROLESP_OWNER_PASSWORD:?defina ROLESP_OWNER_PASSWORD}"
: "${ROLESP_APP_PASSWORD:?defina ROLESP_APP_PASSWORD}"

# Bancos criados: o principal e o de testes (os testes apagam tudo a cada execução)
BANCOS="${ROLESP_BANCOS:-rolesp rolesp_test}"

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname postgres \
  -v owner_senha="$ROLESP_OWNER_PASSWORD" \
  -v app_senha="$ROLESP_APP_PASSWORD" <<'SQL'
CREATE ROLE rolesp_owner LOGIN PASSWORD :'owner_senha';
CREATE ROLE rolesp_app   LOGIN PASSWORD :'app_senha';
SQL

for banco in $BANCOS; do
  psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname postgres -v banco="$banco" <<'SQL'
CREATE DATABASE :"banco" OWNER rolesp_owner ENCODING 'UTF8' TEMPLATE template0;
-- ninguém conecta "por padrão"; só os papéis do projeto
REVOKE CONNECT ON DATABASE :"banco" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"banco" TO rolesp_app;
SQL
  psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname "$banco" <<'SQL'
-- o schema public não aceita CREATE de qualquer um (padrão desde o PG 15);
-- a API só precisa "enxergar" o schema
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO rolesp_app;
SQL
done

echo "Papéis rolesp_owner e rolesp_app criados; bancos: $BANCOS"
