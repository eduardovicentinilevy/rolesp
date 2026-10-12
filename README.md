# Rolê SP

Guia de São Paulo para turistas brasileiros e estrangeiros: pontos turísticos, restaurantes, bares e baladas, sorveterias, padarias e cafés e, principalmente, **lugares bairristas**, aqueles que o paulistano frequenta e o turista normalmente não conhece.

> 🚧 Em construção. Fase atual: **2 — banco de dados** (concluída, aguardando revisão).

| Fase | Status |
|---|---|
| 1. Planejamento | ✔ [`docs/arquitetura.md`](docs/arquitetura.md) |
| 2. Banco de dados | ✔ [`db/README.md`](db/README.md) |
| 3. API pública + testes | — |
| 4. Autenticação, admin e segurança | — |
| 5. Frontend | — |
| 6. Idiomas, acessibilidade e polimento | — |
| 7. README, CI e deploy | — |

## Rodando o banco localmente

```bash
cp .env.example .env
docker compose up -d
cd backend && npm install
npm run db:reset   # schema + dados iniciais
npm run db:test    # testes do banco
```

Detalhes, modelo de dados e decisões técnicas: [`db/README.md`](db/README.md).

**Stack:** React (Vite) · Node.js + Express (CommonJS) · PostgreSQL 16 (SQL puro, sem ORM) · Leaflet + OpenStreetMap · react-i18next · Jest + Supertest · Vitest + React Testing Library · Docker Compose · Google Cloud Run + Cloud SQL + Firebase Hosting
