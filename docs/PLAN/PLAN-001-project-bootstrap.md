# PLAN-001 — Bootstrap do Projeto TagPulse

**Status:** Proposto
**Projeto:** TagPulse
**Documento:** PLAN-001
**Dependência:** ADR-001 — Stack e Estrutura Inicial do TagPulse

---

## 1. Objetivo

Criar a fundação técnica inicial do TagPulse.

Ao final deste plano, o projeto deverá possuir:

* repositório Git funcional;
* estrutura de monorepo simples;
* backend Node.js + TypeScript + Fastify;
* frontend React + TypeScript + Vite;
* Prisma configurado;
* conexão funcional com PostgreSQL/Supabase;
* estrutura documental;
* configuração segura de variáveis de ambiente;
* health check do backend;
* testes básicos;
* build funcional de backend e frontend.

Este plano **não implementará ainda a integração com a API TagPlus**.

---

# 2. Resultado esperado

Ao final do PLAN-001, deverá ser possível executar:

```text
Frontend
   │
   ▼
React / Vite
```

e:

```text
Backend
   │
   ▼
Fastify
   │
   ▼
PostgreSQL / Supabase
```

com todos os componentes funcionando de forma independente.

O milestone será considerado concluído quando a aplicação conseguir comprovar que:

```text
Backend → PostgreSQL
```

está funcionando.

---

# 3. Escopo

O PLAN-001 inclui:

* inicialização do Git;
* criação da estrutura do projeto;
* configuração do backend;
* configuração do frontend;
* instalação do Prisma;
* configuração inicial do PostgreSQL;
* primeira migration;
* health check;
* endpoint de verificação do banco;
* testes básicos;
* scripts de desenvolvimento e build;
* `.gitignore`;
* `.env.example`;
* README inicial.

---

# 4. Fora de escopo

Não implementar neste plano:

* autenticação TagPlus;
* chamadas à API TagPlus;
* sincronização;
* clientes;
* produtos;
* pedidos;
* estoque;
* financeiro;
* dumps históricos;
* scheduler;
* filas;
* autenticação de usuários;
* dashboards;
* multi-tenancy completo;
* lógica específica da Nineclouds.

Esses componentes serão adicionados em etapas posteriores.

---

# 5. Estrutura inicial do repositório

O repositório deverá possuir:

```text
tagpulse/
│
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   ├── src/
│   │   ├── app/
│   │   ├── config/
│   │   ├── database/
│   │   ├── integrations/
│   │   │   └── tagplus/
│   │   ├── modules/
│   │   ├── shared/
│   │   ├── app.ts
│   │   └── server.ts
│   │
│   ├── tests/
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
│
├── docs/
│   ├── PROJECT-VISION.md
│   ├── ADR/
│   │   └── ADR-001-stack-and-project-structure.md
│   ├── PLAN/
│   │   └── PLAN-001-project-bootstrap.md
│   └── SPEC/
│
├── .gitignore
├── README.md
└── package.json
```

O `package.json` na raiz poderá ser utilizado para facilitar comandos comuns do monorepo.

---

# 6. Package manager

Utilizar:

**npm**

A raiz poderá utilizar npm workspaces para simplificar a execução dos dois projetos.

Exemplo conceitual:

```json
{
  "workspaces": [
    "backend",
    "frontend"
  ]
}
```

Não introduzir ferramentas adicionais de monorepo.

---

# 7. Backend

Criar aplicação utilizando:

* Node.js;
* TypeScript;
* Fastify.

Estrutura mínima:

```text
src/
├── app.ts
└── server.ts
```

Responsabilidades:

### `app.ts`

Criar e configurar a instância Fastify.

### `server.ts`

Inicializar o servidor HTTP.

A criação da aplicação deverá ser separada da inicialização para facilitar testes.

---

# 8. Configuração

Criar módulo central de configuração.

Exemplo:

```text
src/config/
└── env.ts
```

As variáveis de ambiente deverão ser validadas no startup.

Variáveis mínimas iniciais:

```text
NODE_ENV=
PORT=
DATABASE_URL=
DIRECT_URL=
```

`DIRECT_URL` poderá ser necessária dependendo da configuração escolhida para Prisma + Supabase.

Nenhum segredo deverá possuir valor default inseguro.

---

# 9. PostgreSQL / Supabase

O banco utilizado será PostgreSQL hospedado no Supabase.

O projeto deverá utilizar conexão PostgreSQL padrão.

O backend não deverá depender do SDK JavaScript do Supabase para acesso às tabelas.

Fluxo:

```text
Fastify
   │
   ▼
Prisma
   │
   ▼
PostgreSQL
   │
   ▼
Supabase
```

---

# 10. Prisma

Instalar e configurar Prisma.

Estrutura:

```text
backend/
└── prisma/
    └── schema.prisma
```

O provider deverá ser:

```text
postgresql
```

Criar `PrismaClient` centralizado.

Exemplo estrutural:

```text
src/database/
└── prisma.ts
```

Não instanciar `PrismaClient` diretamente em múltiplos módulos.

---

# 11. Primeiro modelo de banco

O PLAN-001 não deverá criar o modelo completo do TagPulse.

Entretanto, precisamos de uma entidade mínima para validar migrations e conexão.

Criar inicialmente:

```text
Company
```

Modelo conceitual:

```text
Company

id
name
slug
createdAt
updatedAt
```

Requisitos:

* `id` como identificador interno do TagPulse;
* `slug` único;
* timestamps automáticos.

Não adicionar ainda conceitos como:

* TagPlusConnection;
* Customer;
* Product;
* Order.

Eles pertencem às próximas etapas.

---

# 12. Primeira migration

Gerar uma migration contendo apenas a fundação necessária.

Objetivo:

```text
PostgreSQL
   │
   ▼
companies
```

A migration deverá ser versionada no Git.

A criação manual da tabela através do painel Supabase não deverá substituir a migration.

---

# 13. Seed inicial

Criar um seed simples para ambiente de desenvolvimento.

Registrar:

```text
Nineclouds
```

como primeira `Company`.

Isso é dado de implantação e não regra de domínio.

Exemplo conceitual:

```text
name = Nineclouds
slug = nineclouds
```

O seed deverá ser idempotente.

---

# 14. Health check

Criar:

```text
GET /health
```

Resposta mínima:

```json
{
  "status": "ok"
}
```

Esse endpoint não precisa consultar o banco.

Seu objetivo será verificar que a aplicação HTTP está funcionando.

---

# 15. Database health check

Criar também:

```text
GET /health/database
```

Esse endpoint deverá executar uma operação simples no PostgreSQL.

Por exemplo:

```text
SELECT 1
```

ou equivalente via Prisma.

Resposta de sucesso conceitual:

```json
{
  "status": "ok",
  "database": "connected"
}
```

Não retornar:

* `DATABASE_URL`;
* host completo;
* senha;
* usuário;
* credenciais;
* detalhes internos sensíveis.

---

# 16. Tratamento básico de erros

Configurar tratamento global de erros no Fastify.

O objetivo neste estágio não é criar uma arquitetura sofisticada de erros.

Deverão existir apenas:

* logging do erro;
* resposta HTTP segura;
* prevenção de exposição de stack traces em produção.

---

# 17. Logging

Utilizar inicialmente o logger nativo do Fastify.

O backend deverá registrar pelo menos:

```text
startup
shutdown
request errors
database connection errors
```

Não adicionar plataforma externa de observabilidade neste momento.

---

# 18. Encerramento seguro

Implementar graceful shutdown.

Ao receber sinais de encerramento, o backend deverá:

1. parar de aceitar novas requisições;
2. fechar Fastify;
3. desconectar Prisma;
4. encerrar o processo corretamente.

---

# 19. Frontend

Criar aplicação utilizando:

```text
React
TypeScript
Vite
```

O frontend será inicialmente mínimo.

Não implementar dashboard.

A página inicial poderá exibir somente:

```text
TagPulse
```

e uma indicação de que a aplicação está funcionando.

---

# 20. Comunicação frontend/backend

Não é necessário construir API client completo neste plano.

Entretanto, deverá existir configuração preparada para:

```text
VITE_API_URL=
```

O frontend não deverá possuir URLs hardcoded para `localhost`.

---

# 21. CORS

Configurar CORS no backend através de variável de ambiente.

Exemplo:

```text
FRONTEND_URL=
```

Evitar:

```text
origin: "*"
```

como configuração definitiva.

Para desenvolvimento local, a origem esperada poderá ser:

```text
http://localhost:5173
```

---

# 22. Scripts

O backend deverá possuir scripts equivalentes a:

```text
npm run dev
npm run build
npm run start
npm run test
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

O frontend deverá possuir:

```text
npm run dev
npm run build
npm run test
```

Quando aplicável.

A raiz deverá facilitar:

```text
npm run dev:backend
npm run dev:frontend
npm run build
npm run test
```

Não é obrigatório executar frontend e backend simultaneamente através de uma ferramenta adicional nesta fase.

---

# 23. TypeScript

Configurar TypeScript com regras estritas.

Utilizar:

```text
strict: true
```

Evitar:

* `any` desnecessário;
* imports inconsistentes;
* configurações permissivas apenas para eliminar erros.

---

# 24. Lint e formatação

Configurar:

* ESLint;
* Prettier.

O objetivo é manter consistência para desenvolvimento assistido por IA.

Não introduzir regras excessivamente complexas.

---

# 25. Testes do backend

Criar testes mínimos para:

### Health check

Validar:

```text
GET /health
```

Resultado esperado:

```text
200
status = ok
```

### Database health

A lógica deverá ser estruturada de maneira testável.

Não é obrigatório que todos os testes unitários utilizem banco real.

---

# 26. Testes do frontend

O frontend deverá possuir apenas a infraestrutura mínima de testes se isso não adicionar complexidade relevante.

Não criar uma suíte extensa neste momento.

O critério principal será:

```text
npm run build
```

funcionando.

---

# 27. `.gitignore`

Deverá ignorar pelo menos:

```text
node_modules/
dist/
.env
.env.*
!.env.example
coverage/
*.log
```

Adicionar arquivos específicos de IDE somente quando necessário.

---

# 28. `.env.example`

Backend:

```text
NODE_ENV=development
PORT=3001

DATABASE_URL=
DIRECT_URL=

FRONTEND_URL=http://localhost:5173
```

Frontend:

```text
VITE_API_URL=http://localhost:3001
```

Ainda não incluir credenciais TagPlus.

---

# 29. README

Criar README inicial contendo:

* descrição curta do TagPulse;
* stack;
* pré-requisitos;
* instalação;
* configuração;
* execução do backend;
* execução do frontend;
* migrations;
* seed;
* testes;
* build.

O README não deverá duplicar os documentos arquiteturais.

---

# 30. Git

Criar repositório Git próprio para TagPulse.

Branch inicial:

```text
main
```

O bootstrap deverá resultar em um primeiro commit limpo.

Mensagem sugerida:

```text
chore: bootstrap TagPulse project
```

---

# 31. Não copiar o Stratix

O agente de implementação não deverá copiar o projeto Stratix para criar o TagPulse.

É permitido consultar padrões pontuais caso necessário, mas o bootstrap deverá ser novo.

Não carregar para o TagPulse:

* Identity Core;
* Canonicalization;
* RAW ingestion;
* Discovery;
* OVF;
* Semantic Mapping;
* arquitetura multi-ERP;
* componentes que não fazem parte deste plano.

---

# 32. Critérios de aceite

O PLAN-001 será considerado concluído somente se:

### Repositório

* estrutura criada;
* Git funcionando;
* documentação preservada.

### Backend

* aplicação inicia;
* TypeScript compila;
* `/health` retorna `200`;
* `/health/database` comprova conexão com PostgreSQL;
* Prisma funciona;
* migration aplicada;
* seed funciona;
* testes passam.

### Banco

* tabela `Company` criada por migration;
* Nineclouds criada via seed;
* segunda execução do seed não duplica registro.

### Frontend

* aplicação inicia;
* build funciona;
* configuração de API não está hardcoded.

### Qualidade

* `.env` não versionado;
* `.env.example` presente;
* lint passa;
* build passa;
* testes passam;
* nenhum segredo aparece no repositório.

---

# 33. Evidências obrigatórias

Ao concluir a implementação, o agente deverá apresentar:

```text
1. árvore de arquivos relevante
2. git status
3. migrations existentes
4. resultado do Prisma generate
5. resultado da migration
6. resultado do seed
7. teste GET /health
8. teste GET /health/database
9. npm test
10. npm run build
```

Se alguma etapa não puder ser executada por falta de credencial ou configuração externa, isso deverá ser declarado explicitamente.

Não simular sucesso.

---

# 34. Proibições desta fase

Não implementar antecipadamente:

```text
TagPlus API client
OAuth TagPlus
Customer model
Product model
Order model
SyncCheckpoint
scheduler
queues
dashboard
authentication
Supabase Auth
Supabase Realtime
dump importer
```

Mesmo que pareçam extensões naturais.

O objetivo é preservar o milestone pequeno.

---

# 35. Checkpoint

Ao final, interromper o desenvolvimento.

Não avançar automaticamente para o próximo plano.

O estado esperado será:

```text
TagPulse
│
├── documentação
├── backend funcionando
├── frontend funcionando
├── PostgreSQL conectado
├── Prisma funcionando
└── nenhuma integração TagPlus ainda
```

O próximo passo será revisar o checkpoint antes de iniciar qualquer código de integração.

---

# 36. Próxima etapa

Após aprovação do PLAN-001:

**SPEC-001 — Contrato e Inspeção da API TagPlus**

Essa fase deverá recuperar e validar o conhecimento já adquirido sobre a API, com atenção especial ao problema anteriormente identificado de campos não detectados.

Somente depois dessa inspeção será definido o primeiro modelo de domínio sincronizado.