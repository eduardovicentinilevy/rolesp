# API do Rolê SP — referência

Base: `/api`. JSON com chaves em português e `snake_case`, iguais às colunas do banco.

## Convenções

- **Envelope de sucesso:** `{ "dados": ... }`. Listas paginadas também trazem `paginacao`:
  `{ "pagina": 1, "limite": 20, "total": 57, "total_paginas": 3 }`.
- **Envelope de erro:** `{ "erro": { "codigo", "mensagem", "detalhes"?, "request_id" } }`.
- **Idioma:** `?lang=pt|en|de|fr` (padrão `pt`). Se faltar tradução no idioma pedido, o conteúdo vem em
  português e o campo `idioma_conteudo` informa o idioma real do texto.
- **Identificadores:** rotas públicas usam **slug**; rotas de admin usam **id**. Corpos de escrita
  referenciam categoria, bairro, tags e lugares por **slug**.
- **Query strings com listas:** `?tags=a,b` ou `?tags=a&tags=b`.
- Query strings e corpos são **estritos**: campo desconhecido gera 400.

| Status | Código | Quando |
|---|---|---|
| 200 | — | Leitura ou atualização |
| 201 | — | Criação (admin: com header `Location`) |
| 204 | — | Exclusão ou logout |
| 400 | `VALIDACAO`, `CORPO_INVALIDO` | Entrada inválida |
| 401 | `NAO_AUTENTICADO`, `CREDENCIAIS_INVALIDAS` | Sem sessão ou login recusado |
| 403 | `ORIGEM_NAO_PERMITIDA` | Mutação vinda de origem fora da lista |
| 404 | `NAO_ENCONTRADO`, `ROTA_NAO_ENCONTRADA` | Recurso ou rota inexistente |
| 409 | `CONFLITO`, `EM_USO` | Slug duplicado, ou exclusão bloqueada por uso |
| 413 | `CORPO_GRANDE_DEMAIS` | Corpo acima de 20 KB |
| 415 | `TIPO_NAO_SUPORTADO` | Mutação sem `application/json` |
| 422 | `REFERENCIA_INVALIDA` | Slug de categoria, bairro, tag ou lugar que não existe |
| 429 | `MUITAS_REQUISICOES` | Rate limit (com `Retry-After`) |
| 500 | `ERRO_INTERNO` | Erro inesperado (sem detalhes técnicos) |
| 503 | `INDISPONIVEL` | Banco fora do ar ou consulta lenta demais |

## Objetos

### LugarResumo

```json
{
  "slug": "masp",
  "nome": "MASP",
  "categoria": { "slug": "pontos-turisticos", "nome": "Pontos turísticos", "icone": "monumento" },
  "bairro": { "slug": "bela-vista", "nome": "Bela Vista" },
  "faixa_preco": null,
  "is_bairrista": false,
  "verificado": false,
  "latitude": -23.5611,
  "longitude": -46.6558,
  "imagem_url": null,
  "imagem_alt": null,
  "descricao": "…",
  "dica_local": "…",
  "idioma_conteudo": "pt",
  "media_notas": 4.5,
  "total_avaliacoes": 2,
  "tags": [{ "slug": "gratuito", "nome": "Gratuito" }]
}
```

`media_notas` é `null` quando não há avaliação aprovada. `faixa_preco`, `latitude`, `longitude` e
`endereco` podem ser `null` (informação a confirmar).

### LugarDetalhe

`LugarResumo` mais:

```json
{
  "endereco": "Av. Paulista, 1578",
  "site": "https://masp.org.br",
  "instagram": "masp",
  "imagem_credito": null,
  "verificado_em": null,
  "horario_observacao": "Fecha às segundas",
  "horarios": [{ "dia_semana": 2, "abre": "10:00", "fecha": "18:00" }],
  "roteiros": [{ "slug": "um-dia-no-centro-historico", "titulo": "Um dia no Centro Histórico" }],
  "atualizado_em": "2026-10-11T20:00:00.000Z"
}
```

`dia_semana`: 0 = domingo … 6 = sábado. Se `fecha` < `abre`, o turno passa da meia-noite.

## Rotas públicas

### `GET /api/lugares`

Filtros: `categoria`, `bairro`, `preco` (1 a 4), `tags` (o lugar precisa ter **todas**), `bairrista=true`,
`q` (busca textual, até 100 caracteres), `lang`, `ordem` (`relevancia` | `nome` | `nota` | `recentes`),
`page` (≥ 1), `limit` (1 a 50, padrão 20).
Resposta: `{ dados: LugarResumo[], paginacao }`.

### `GET /api/lugares/:slug?lang=`

Resposta: `{ dados: LugarDetalhe }` ou 404.

### `GET /api/lugares/:slug/avaliacoes?page=&limit=`

Avaliações **aprovadas**, das mais novas para as mais antigas. `limit` de 1 a 50, padrão 10.

```json
{
  "dados": [
    { "id": 7, "nome_autor": "Ana", "nota": 5, "comentario": "…", "idioma": "pt", "criado_em": "…" }
  ],
  "paginacao": { "pagina": 1, "limite": 10, "total": 1, "total_paginas": 1 }
}
```

`nome_autor` pode ser `null` (anônimo). 404 se o lugar não existe.

### `POST /api/lugares/:slug/avaliacoes`

Rate limit: 5 por hora por IP. Corpo:

```json
{ "nota": 5, "comentario": "Opcional, até 1000 caracteres", "nome_autor": "Opcional, até 40", "idioma": "pt", "website": "" }
```

- `website` é um *honeypot*: o campo fica escondido no formulário. Se vier preenchido, a API responde 201
  normalmente, mas não grava nada (robôs não percebem).
- Comentário e nome passam por limpeza de HTML: são gravados como texto puro.
- Toda avaliação nasce com `status = pendente`; o visitante não consegue escolher o status.

Resposta 201: `{ "dados": { "status": "pendente" }, "mensagem": "…" }`. 404 se o lugar não existe.

### `GET /api/dica-do-dia?lang=`

```json
{
  "dados": {
    "data": "2026-10-11",
    "dica_local": "…",
    "idioma_conteudo": "pt",
    "lugar": { "slug", "nome", "imagem_url", "imagem_alt", "is_bairrista", "verificado", "categoria", "bairro" }
  }
}
```

`dados` é `null` se nenhum lugar bairrista tiver dica.

### `GET /api/bairros?lang=&destaque=true`

```json
{
  "dados": [
    {
      "slug": "mooca", "nome": "Mooca", "zona": "leste", "latitude": -23.55, "longitude": -46.6,
      "imagem_url": null, "destaque": true, "descricao": "…", "idioma_conteudo": "pt", "total_lugares": 3
    }
  ]
}
```

Ordem alfabética (sem diferenciar acentos). Sem paginação.

### `GET /api/bairros/:slug?lang=`

Resumo do bairro mais `historia` (texto ou `null`) e `curiosidades` (array de textos). Os lugares do bairro
vêm de `GET /api/lugares?bairro=:slug`.

### `GET /api/categorias` e `GET /api/tags`

`{ dados: [{ slug, nome, icone, ordem, total_lugares }] }` e `{ dados: [{ slug, nome, total_lugares }] }`.

### `GET /api/roteiros?lang=`

```json
{
  "dados": [
    {
      "slug": "um-dia-no-centro-historico", "titulo": "…", "descricao": "…", "duracao_minutos": 480,
      "imagem_url": null, "bairro": { "slug": "centro-historico", "nome": "Centro Histórico" },
      "total_paradas": 5, "idioma_conteudo": "pt"
    }
  ]
}
```

`bairro` pode ser `null`.

### `GET /api/roteiros/:slug?lang=`

Resumo do roteiro mais `paradas`, em ordem:

```json
{ "ordem": 1, "observacao": "Comece pelo café da manhã", "lugar": LugarResumo }
```

`observacao` segue o fallback de idioma e pode ser `null`.

### `GET /api/saude`

`{ "status": "ok", "banco": "ok" }` ou 503.

## Autenticação

| Rota | Descrição |
|---|---|
| `POST /api/auth/login` | Corpo `{ email, senha }`. 200 com `{ dados: { id, email } }` e cookie `__session` (`HttpOnly`, `SameSite=Strict`, `Path=/api`). Rate limit: 10 a cada 15 min por IP. Após 5 senhas erradas, a conta fica bloqueada por 15 min. A resposta de falha é sempre a mesma (`CREDENCIAIS_INVALIDAS`). |
| `POST /api/auth/logout` | 204, apaga o cookie |
| `GET /api/auth/me` | 200 `{ dados: { id, email } }` ou 401 |

## Rotas de admin

Todas exigem o cookie de sessão e respondem com `Cache-Control: no-store`.

### Lugares — `/api/admin/lugares`

- `GET /api/admin/lugares?q=&page=&limit=&verificado=true|false`: lista
  `{ id, slug, nome, categoria_slug, bairro_slug, is_bairrista, verificado, atualizado_em, avaliacoes_pendentes }`,
  ordenada por `atualizado_em` desc. `q` filtra por nome (pedaço, sem acento).
- `GET /api/admin/lugares/:id`: `LugarAdmin` (abaixo).
- `POST /api/admin/lugares`: corpo `LugarEntrada`. 201 + `Location` + `{ dados: LugarAdmin }`.
- `PUT /api/admin/lugares/:id`: corpo `LugarEntrada` (substitui tudo, numa transação). 200 + `{ dados: LugarAdmin }`.
- `DELETE /api/admin/lugares/:id`: 204. 409 `EM_USO` se o lugar está em algum roteiro.

`LugarEntrada`:

```json
{
  "nome": "Pastel da Maria",
  "slug": "pastel-da-maria",
  "categoria_slug": "feiras-e-pracas",
  "bairro_slug": "pacaembu",
  "endereco": null,
  "latitude": null,
  "longitude": null,
  "faixa_preco": null,
  "site": null,
  "instagram": null,
  "imagem_url": null,
  "imagem_credito": null,
  "is_bairrista": true,
  "verificado": false,
  "traducoes": {
    "pt": { "descricao": "obrigatória", "dica_local": null, "imagem_alt": null, "horario_observacao": null },
    "en": { "descricao": "…" }
  },
  "tags": ["ao-ar-livre"],
  "horarios": [{ "dia_semana": 2, "abre": "07:00", "fecha": "13:00" }]
}
```

- `slug` é opcional: sem ele, a API gera a partir do nome.
- `traducoes.pt` é obrigatória; os outros idiomas são opcionais.
- `verificado: true` grava `verificado_em = now()` na primeira vez e mantém a data original nas edições
  seguintes. `false` limpa a data.
- Latitude e longitude vêm juntas, dentro da Grande SP.
- `site` só aceita http(s); `imagem_url` só aceita https; `instagram` é só o usuário, sem "@".

`LugarAdmin` = `LugarEntrada` + `id`, `verificado_em`, `criado_em`, `atualizado_em`.

### Bairros — `/api/admin/bairros`

- `GET` (lista `{ id, slug, nome, zona, destaque, total_lugares, atualizado_em }`), `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`.
- `DELETE` devolve 409 `EM_USO` se o bairro tiver lugares.
- `BairroEntrada`:

```json
{
  "nome": "Mooca", "slug": "mooca", "zona": "leste", "latitude": -23.55, "longitude": -46.6,
  "imagem_url": null, "destaque": true,
  "traducoes": { "pt": { "descricao": "obrigatória", "historia": null, "curiosidades": ["…"] } }
}
```

### Roteiros — `/api/admin/roteiros`

- `GET` (lista `{ id, slug, titulo, total_paradas, atualizado_em }`), `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`.
- `POST` e `PUT` gravam o roteiro, as traduções e as paradas numa **transação**: tudo ou nada.
- `RoteiroEntrada`:

```json
{
  "slug": "noite-na-vila-madalena",
  "bairro_slug": "vila-madalena",
  "duracao_minutos": 360,
  "imagem_url": null,
  "traducoes": { "pt": { "titulo": "obrigatório", "descricao": "obrigatória" } },
  "paradas": [
    { "lugar_slug": "beco-do-batman", "observacoes": { "pt": "Chegue antes de escurecer" } }
  ]
}
```

- A ordem das paradas é a ordem do array (1 a 30 paradas, sem lugar repetido).
- `slug` é opcional: sem ele, a API gera a partir do título em português.
- Lugar inexistente: 422 `REFERENCIA_INVALIDA`, e nada é gravado.

### Avaliações — `/api/admin/avaliacoes`

- `GET /api/admin/avaliacoes?status=pendente|aprovada|rejeitada&page=&limit=` (padrão `pendente`, das mais
  antigas para as mais novas):
  `{ id, lugar: { slug, nome }, nome_autor, nota, comentario, idioma, status, criado_em, moderado_em, moderado_por }`,
  onde `moderado_por` é o e-mail do admin ou `null`.
- `PATCH /api/admin/avaliacoes/:id` com `{ "status": "aprovada" | "rejeitada" }`: grava `moderado_em` e
  `moderado_por`. 200 com a avaliação atualizada.
