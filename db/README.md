# Banco de dados do Rolê SP

PostgreSQL 16 com SQL escrito à mão, sem ORM. Esta pasta tem tudo o que é do banco:

| Pasta / arquivo | O que tem |
|---|---|
| [`migrations/`](migrations) | Schema em arquivos `.sql` numerados (`001_...` a `007_...`). Uma migration aplicada **nunca** é editada; mudança de schema = arquivo novo. |
| [`seeds/`](seeds) | Dados iniciais: idiomas, categorias, tags, bairros, lugares, roteiros. Idempotentes. |
| [`testes/constraints.sql`](testes/constraints.sql) | Testes do próprio banco: o que ele deve recusar e como deve se comportar. |
| [`consultas-exemplo.sql`](consultas-exemplo.sql) | Consultas comentadas para rodar no `psql`. São a base dos repositories da API (fase 3). |

Os comandos ficam no `backend/package.json` e rodam pelo Node (`backend/scripts/`), sem precisar do `psql` instalado.

## Como rodar

Pré-requisitos: Docker e Node.js 20+.

```bash
# 1. Na raiz do repositório: variáveis de ambiente (os valores de exemplo servem para desenvolvimento)
cp .env.example .env

# 2. Sobe o PostgreSQL 16 (porta publicada só em 127.0.0.1)
docker compose up -d

# 3. Cria o schema e carrega os dados
cd backend
npm install
npm run db:reset     # = apaga tudo + migrate + seed

# 4. Roda os testes do banco
npm run db:test
```

Para abrir um `psql` dentro do container: `docker exec -it rolesp-db psql -U rolesp -d rolesp`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run db:migrate` | Aplica as migrations pendentes, cada uma na sua transação. Recusa rodar se alguma migration aplicada foi editada, sumiu do repositório ou se um arquivo novo tem número menor que o da última aplicada. |
| `npm run db:status` | Mostra cada migration: aplicada (com data), pendente, editada, ausente ou fora de ordem. Não altera nada. |
| `npm run db:seed` | Roda todos os seeds numa única transação. Pula os `*.dev.sql` quando `NODE_ENV=production`. Avisa e para se o schema ainda não existe ou se há migration pendente. |
| `npm run db:reset` | `DROP SCHEMA public CASCADE`, depois migrate e seed. Recusa rodar com `NODE_ENV=production` ou se o host do `DATABASE_URL` não for local. |
| `npm run db:test` | Roda `testes/constraints.sql` e mostra cada `RAISE NOTICE`. Sai com código 1 se algum teste falhar. Não grava nada (termina em `ROLLBACK`). |

Os scripts leem o `.env` da raiz. Uma variável já definida no ambiente vence o `.env`, então dá para apontar para outro banco assim:

```bash
DATABASE_URL=postgres://rolesp:rolesp_dev@127.0.0.1:5432/outro_banco npm run db:status
```

### Como o runner de migrations funciona

```mermaid
flowchart TD
    A[npm run db:migrate] --> B["pg_try_advisory_lock<br/>(outra execução? espera até 60 s)"]
    B --> C["lê db/migrations/*.sql<br/>calcula SHA-256 de cada arquivo"]
    C --> D{"compara com<br/>schema_migrations"}
    D -->|"editada, ausente<br/>ou fora de ordem"| E["recusa: nada é aplicado"]
    D -->|ok| F["para cada pendente:<br/>BEGIN → arquivo → INSERT em schema_migrations → COMMIT"]
    F -->|erro| G["ROLLBACK e mensagem com<br/>arquivo:linha:coluna"]
```

- **Checksum SHA-256**: o runner grava o hash de cada arquivo aplicado. Se alguém editar uma migration já aplicada, o hash não bate e o migrate recusa rodar. As quebras de linha são normalizadas antes do cálculo (e o `.gitattributes` força LF), para o mesmo arquivo dar o mesmo hash no Windows e no Linux.
- **Uma transação por migration**: no PostgreSQL até `CREATE TABLE` e `CREATE INDEX` respeitam `ROLLBACK`. Se a migration falha no meio, nada dela fica no banco. (Consequência: comandos que não rodam em transação, como `CREATE INDEX CONCURRENTLY`, não cabem neste runner.)
- **Advisory lock**: dois deploys ao mesmo tempo não aplicam a mesma migration duas vezes. O segundo espera o primeiro e depois encontra tudo aplicado.
- **Erro com arquivo e linha**: o PostgreSQL devolve a posição do erro (`erro.position`, em caracteres); o runner converte em linha e coluna e mostra o trecho com `^`.

## Modelo de dados

```mermaid
erDiagram
    idiomas ||--o{ bairro_traducoes : ""
    idiomas ||--o{ lugar_traducoes : ""
    idiomas ||--o{ roteiro_traducoes : ""
    idiomas ||--o{ avaliacoes : "escrita em"
    bairros ||--|{ bairro_traducoes : "textos"
    bairros ||--o{ lugares : "fica em"
    categorias ||--o{ lugares : "classifica"
    lugares ||--|{ lugar_traducoes : "textos"
    lugares ||--o{ lugar_tags : ""
    tags ||--o{ lugar_tags : ""
    lugares ||--o{ avaliacoes : "recebe"
    admins |o--o{ avaliacoes : "modera"
    roteiros ||--|{ roteiro_traducoes : "textos"
    roteiros ||--|{ roteiro_lugares : "paradas"
    lugares ||--o{ roteiro_lugares : "aparece em"

    idiomas {
        text codigo PK "pt, en, de, fr"
        text nome
        boolean ativo
    }
    bairros {
        int id PK
        slug slug UK
        text nome "COLLATE pt_br"
        text zona "centro|norte|sul|leste|oeste"
        numeric latitude
        numeric longitude
    }
    bairro_traducoes {
        int bairro_id PK,FK
        text idioma PK,FK
        text descricao
        text curiosidade
    }
    categorias {
        int id PK
        slug slug UK
        rotulo_i18n nome "jsonb com pt obrigatório"
        text icone
        smallint ordem
    }
    lugares {
        int id PK
        slug slug UK
        text nome "COLLATE pt_br"
        int categoria_id FK
        int bairro_id FK
        text endereco "NULL = a confirmar"
        numeric latitude
        numeric longitude
        smallint faixa_preco "1 a 4"
        jsonb horario_funcionamento
        text site "só https"
        text instagram
        text imagem_url "só https"
        boolean is_bairrista
        boolean verificado
        timestamptz verificado_em
        boolean ativo "exclusão lógica"
        tsvector busca_nome "gerada"
    }
    lugar_traducoes {
        int lugar_id PK,FK
        text idioma PK,FK
        text descricao
        text dica_local
        tsvector busca "gerada"
    }
    tags {
        int id PK
        slug slug UK
        rotulo_i18n nome
    }
    lugar_tags {
        int lugar_id PK,FK
        int tag_id PK,FK
    }
    admins {
        int id PK
        text nome
        text email "único em lower()"
        text senha_hash "formato bcrypt"
        boolean ativo
        timestamptz ultimo_login_em
    }
    avaliacoes {
        bigint id PK
        int lugar_id FK
        text nome_autor
        smallint nota "1 a 5"
        text comentario "até 1000"
        text idioma FK
        text status "pendente|aprovada|rejeitada"
        int moderado_por FK "SET NULL"
        timestamptz moderado_em
    }
    roteiros {
        int id PK
        slug slug UK
        smallint duracao_minutos
        text imagem_url
        boolean publicado
    }
    roteiro_traducoes {
        int roteiro_id PK,FK
        text idioma PK,FK
        text titulo
        text descricao
    }
    roteiro_lugares {
        int roteiro_id PK,FK
        int lugar_id PK,FK "RESTRICT"
        smallint ordem "UNIQUE deferrable"
        rotulo_i18n observacao
    }
```

Todas as tabelas com dado editável (`bairros`, `lugares`, `admins`, `roteiros`) têm `criado_em` e `atualizado_em`. O `atualizado_em` é mantido por trigger.

### Views

| View | Para quê |
|---|---|
| `vw_lugares_resumo` | Tudo o que um card de lugar precisa, já traduzido. Uma linha por **lugar ativo × idioma ativo**: categoria, bairro e tags traduzidos (`tags` em jsonb `[{slug, nome}]` e `tag_slugs text[]` para filtrar), descrição e dica com fallback para PT, `traducao_disponivel`, `idioma_conteudo`, `nota_media` e `total_avaliacoes` (só aprovadas) e a coluna `busca` (tsvector). |
| `vw_pendencias_conteudo` | Para cada lugar ativo, um array com o que falta: `nao_verificado`, `sem_endereco`, `sem_coordenadas`, `sem_imagem`, `sem_traducao_<idioma ativo>`. Vai alimentar o painel do admin. |

## Decisões técnicas

**Por que PostgreSQL 16 na imagem Debian?** A imagem `alpine` não traz os dados completos do ICU, e a collation `pt_br` depende deles. Sem collation ICU, o `ORDER BY` segue a ordem do sistema operacional do servidor, que muda de máquina para máquina.

**Por que `GENERATED ALWAYS AS IDENTITY` e não `serial`?** É o padrão SQL. O `ALWAYS` impede que alguém grave um id na mão e dessincronize a sequência.

**Por que domínios (`slug`, `rotulo_i18n`)?** A regra fica escrita uma vez só, e toda coluna que usa o tipo herda. Um slug inválido é recusado em qualquer tabela, sem repetir o CHECK.

**Tradução em tabela ou em jsonb?** As duas, cada uma onde faz sentido:
- textos longos e pesquisáveis (descrição, dica, história do bairro, título do roteiro) ficam em tabelas `*_traducoes`, uma linha por idioma, com coluna `busca` gerada no idioma certo;
- rótulos curtos (nome de categoria e tag, observação de parada) ficam em `rotulo_i18n` (jsonb), porque uma tabela de tradução para "Bares" seria peso à toa.

**Por que `idiomas` é uma tabela, e não um CHECK?** Para que ativar o alemão seja só `UPDATE idiomas SET ativo = true WHERE codigo = 'de'`. A view passa a gerar linhas em DE na hora, e a `vw_pendencias_conteudo` passa a apontar `sem_traducao_de` em cada lugar ainda não traduzido.

**CHECK que dá NULL é aprovado.** O PostgreSQL só recusa quando o CHECK dá `false`; `NULL` passa. Exemplo real deste schema: `jsonb_typeof(VALUE -> 'pt') = 'string'`, sozinho, daria `NULL` para um rótulo **sem** a chave `pt`, e o rótulo seria aceito. Por isso o domínio testa `VALUE ? 'pt'` primeiro (dá `false`, não `NULL`). Pelo mesmo motivo, o par de coordenadas é `(latitude IS NULL) = (longitude IS NULL)`: `IS NULL` nunca devolve `NULL`.

**Exclusão lógica (`ativo`) nos lugares.** Apagar de verdade perderia o histórico (avaliações) e quebraria roteiros. A FK de `roteiro_lugares` para `lugares` é `RESTRICT` justamente para impedir um roteiro com buraco.

**`UNIQUE (roteiro_id, ordem) DEFERRABLE INITIALLY DEFERRED`.** Trocar a ordem de duas paradas passa por um estado intermediário com posição repetida. Com a checagem adiada para o `COMMIT`, a troca funciona em dois `UPDATE`s dentro de uma transação. (Detalhe: `ON CONFLICT` não aceita constraint deferrable como árbitro; os seeds apontam para a PK.)

**Média sem distorção.** Na `vw_lugares_resumo`, as notas são agregadas numa subconsulta com `GROUP BY` **antes** do join. Se o `GROUP BY` viesse depois de juntar as tags, cada avaliação apareceria repetida uma vez por tag e o total sairia multiplicado.

**Índice em toda FK.** O PostgreSQL cria índice para PK e UNIQUE, mas não para FK. Sem ele, apagar uma linha "pai" varre a tabela filha inteira. O `testes/constraints.sql` confere essa regra no catálogo, então uma FK nova sem índice faz o teste falhar.

**Índices parciais** para as consultas que só olham um pedaço da tabela: lugares bairristas ativos, avaliações aprovadas por lugar e data, fila de pendentes.

**LGPD.** A avaliação guarda só o necessário para ser exibida: nome (pode ser apelido), nota, comentário e idioma. Sem e-mail e sem IP.

**Senha nunca em texto puro.** `admins.senha_hash` tem um CHECK com o formato de hash bcrypt. Um bug que tentasse gravar a senha crua é recusado pelo próprio banco.

### Busca textual

A busca usa o full-text search do PostgreSQL, sem serviço externo:

- **Configurações sem acento** (`pt_sem_acento`, `en_sem_acento`, `de_sem_acento`, `fr_sem_acento`): cópias das configurações padrão com o `unaccent` rodando antes do stemmer. "mercadão" e "mercadao" viram o mesmo termo.
- **`simples_sem_acento`**: sem stemmer, para nomes próprios.
- **Colunas `tsvector` geradas** (`lugares.busca_nome` e `lugar_traducoes.busca`): o PostgreSQL recalcula sozinho a cada escrita. Pesos: nome A, descrição B, dica C, bairro D. O `ts_rank` usa esses pesos para ordenar.
- **`fn_config_busca(idioma)`** é `IMMUTABLE` porque aparece em coluna gerada, e o PostgreSQL só aceita funções imutáveis ali.
- **`fn_tsquery_busca(texto, idioma)`** junta três consultas com OU:
  1. `websearch_to_tsquery` no idioma da página (aceita `"frase exata"`, `OR` e `-palavra`, e nunca dá erro de sintaxe);
  2. `websearch_to_tsquery` em `simples_sem_acento`, para nomes próprios;
  3. prefixo: `ibira` acha Ibirapuera.

  O texto do usuário é reduzido a `[a-z0-9]` antes de virar `to_tsquery`, então não dá para injetar operadores de tsquery. As palavras com `-` excluem por fora do OU: se a exclusão ficasse só dentro de cada consulta, um lugar podia "escapar" pela outra.

**Limitações conhecidas (documentadas de propósito):**
- O stemmer de português reduz "museu" a `mus`, mas deixa "museus" como `museus`. Buscar "museus" não acha "Museu do Ipiranga" pelo radical. A coluna `busca` inclui o nome também na configuração simples, e a busca por prefixo ajuda em vários casos, mas não neste.
- A coluna `busca` da view é calculada na hora da consulta, então não usa os índices GIN. Com poucas dezenas de lugares isso é irrelevante. Com milhares, o caminho é materializar (uma `MATERIALIZED VIEW` ou uma tabela de busca mantida por trigger). Os índices GIN de `lugares.busca_nome` e `lugar_traducoes.busca` já servem consultas diretas nas tabelas.
- Lugar sem tradução no idioma pedido é buscado pelo texto em PT, mas com a consulta montada no idioma pedido. O stemmer não bate; o nome (configuração simples) e o prefixo continuam funcionando.

## Dados iniciais

Os seeds ficam em [`seeds/`](seeds) e rodam em ordem, todos numa transação:

| Arquivo | Conteúdo |
|---|---|
| `001_idiomas.sql` | pt e en ativos; de e fr cadastrados, mas inativos |
| `002_categorias_e_tags.sql` | 6 categorias e 12 tags, com rótulos em PT, EN, DE e FR |
| `003_bairros.sql` | 14 bairros, com descrição e curiosidade em PT e EN |
| `004_lugares.sql` | 24 lugares, com descrição em PT e EN e dica de local |
| `005_roteiros.sql` | 3 roteiros publicados, com as paradas em ordem |
| `900_avaliacoes_teste.dev.sql` | Avaliações de teste (aprovadas, uma pendente, uma rejeitada). Não roda em produção. |
| `999_conferencia.sql` | Confere os dados e aborta tudo se achar lugar ou bairro sem tradução PT, roteiro publicado sem título ou com menos de 2 paradas, ou categoria sem nenhum lugar |

**Regras dos dados:**
- **Todos os lugares estão com `verificado = false`.** O front mostra "informação a confirmar".
- Pontos turísticos: endereço e coordenadas **aproximados**, conferidos em Wikipedia/Wikidata e sites oficiais.
- Comércios (bares, restaurantes, padaria, sorveteria, balada): **só nome, categoria e bairro**. Endereço, coordenadas, horário e preço ficam `NULL`, porque mudam com o tempo e não foram conferidos.
- Descrições só com fatos consolidados (data de inauguração, arquiteto, o que o lugar é). Nada de preço, dia grátis ou horário.
- Nenhum admin é criado por seed. O primeiro admin é criado por um comando interativo (fase 4).

**Idempotência:** rodar `npm run db:seed` de novo não muda nada. Os `INSERT`s usam `ON CONFLICT (...) DO NOTHING` apontando para a PK ou UNIQUE. As avaliações de teste não têm chave natural, então usam `WHERE NOT EXISTS`.

**Slug digitado errado não some em silêncio.** As FKs são resolvidas por JOIN no slug (`LEFT JOIN categorias c ON c.slug = d.categoria`). Com `LEFT JOIN`, um slug errado vira `NULL`, e a `NOT NULL` da coluna estoura na hora, mostrando a linha no `DETAIL` do erro. O `999_conferencia.sql` é a segunda rede.
