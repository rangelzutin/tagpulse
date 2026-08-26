# TagPulse

Fundação técnica da plataforma TagPulse, especializada em dados e operações para empresas que utilizam o ERP TagPlus. Este bootstrap não contém integração com o TagPlus.

## Stack

- Backend: Node.js, TypeScript, Fastify, Prisma e PostgreSQL
- Frontend: React, TypeScript e Vite
- Testes: Vitest
- Monorepo: npm workspaces

## Pré-requisitos

- Node.js 20 ou superior
- npm
- PostgreSQL (o ambiente inicial previsto é Supabase PostgreSQL)

## Instalação

```bash
npm install
```

Copie `backend/.env.example` para `backend/.env` e `frontend/.env.example` para `frontend/.env`. Preencha as URLs reais do PostgreSQL no arquivo do backend; não versione esses arquivos.

## Banco de dados

```bash
npm run prisma:generate --workspace backend
npm run prisma:migrate --workspace backend
npm run prisma:seed --workspace backend
```

`DATABASE_URL` é a conexão usada pela aplicação e `DIRECT_URL` é a conexão direta usada para migrations, quando exigida pelo provedor.

## Desenvolvimento

Em terminais separados:

```bash
npm run dev:backend
npm run dev:frontend
```

O backend usa `PORT` e aceita CORS somente para `FRONTEND_URL`. O frontend lê a URL da API de `VITE_API_URL`.

## Qualidade e build

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Os endpoints iniciais são `GET /health` (aplicação) e `GET /health/database` (conexão PostgreSQL).

As decisões e o escopo estão em `docs/ADR` e `docs/PLAN`.
