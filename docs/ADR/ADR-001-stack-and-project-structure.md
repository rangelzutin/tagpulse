# ADR-001 — Stack e Estrutura Inicial do TagPulse

**Status:** Aceito
**Projeto:** TagPulse
**Documento:** ADR-001
**Decisão:** Stack tecnológica e estrutura inicial do projeto

---

## 1. Contexto

O TagPulse será uma plataforma especializada em dados, inteligência e operações para empresas que utilizam o ERP TagPlus.

O produto será desenvolvido do zero e terá como primeira implantação a Nineclouds.

A arquitetura precisa atender simultaneamente a quatro objetivos:

1. permitir desenvolvimento rápido;
2. manter alta confiabilidade na ingestão dos dados do TagPlus;
3. não criar complexidade genérica desnecessária;
4. não impedir a evolução futura para outros clientes TagPlus.

O TagPulse não deverá reproduzir a arquitetura multi-ERP do Stratix.

A stack deve favorecer simplicidade operacional, facilidade de desenvolvimento assistido por IA, boa capacidade de testes e possibilidade de evolução futura.

---

# 2. Decisão

A stack inicial do TagPulse será:

```text
Frontend
React
Vite
TypeScript

Backend
Node.js
TypeScript
Fastify

Database
PostgreSQL

Database Platform
Supabase

ORM / Data Access
Prisma

Repository
Monorepo simples

Testing
Vitest

Package Manager
npm

Version Control
Git
```

---

# 3. Banco de dados

## Decisão

O banco oficial do TagPulse será:

**PostgreSQL**

O ambiente inicial utilizará:

**Supabase PostgreSQL**

Supabase deverá ser tratado como plataforma de infraestrutura e não como dependência arquitetural obrigatória do domínio TagPulse.

---

## 3.1. Por que PostgreSQL

O TagPulse terá forte dependência de:

* relacionamentos;
* agregações;
* histórico;
* consultas analíticas;
* consistência;
* transações;
* filtros complexos;
* grandes volumes progressivos de dados;
* reconstrução histórica.

PostgreSQL atende diretamente a essas necessidades.

Além disso, facilita a futura utilização de:

* views;
* materialized views;
* índices especializados;
* JSONB;
* funções SQL;
* CTEs;
* window functions;
* consultas analíticas mais avançadas.

---

# 4. Uso do Supabase

## Decisão

O Supabase será utilizado inicialmente como ambiente PostgreSQL gerenciado do TagPulse.

O objetivo é aproveitar:

* provisionamento simples;
* interface administrativa;
* gerenciamento de banco;
* backups conforme o plano utilizado;
* acesso facilitado ao PostgreSQL;
* possibilidade futura de autenticação;
* possibilidade futura de storage;
* experiência prática com a plataforma.

Entretanto:

> O domínio central do TagPulse não deverá depender de funcionalidades exclusivas do Supabase.

O backend deverá acessar PostgreSQL através de uma conexão SQL normal.

Arquitetura:

```text
TagPulse Backend
       │
       │ PostgreSQL connection
       ▼
Supabase PostgreSQL
```

Isso deverá permitir futuramente substituir:

```text
Supabase PostgreSQL
```

por:

```text
PostgreSQL gerenciado em outro provedor
```

sem reescrever o domínio da aplicação.

---

# 5. O que não será usado inicialmente do Supabase

O primeiro ciclo do TagPulse não dependerá de:

* Supabase Edge Functions;
* Supabase Realtime;
* Supabase Storage;
* acesso direto do frontend ao banco;
* lógica de negócio dentro do Supabase;
* triggers complexas específicas da plataforma;
* arquitetura baseada exclusivamente no SDK Supabase.

Esses recursos poderão ser avaliados futuramente quando houver necessidade concreta.

---

# 6. Regra de acesso ao banco

O fluxo principal será:

```text
Frontend
   │
   ▼
TagPulse API
   │
   ▼
Application / Domain Services
   │
   ▼
Prisma / SQL
   │
   ▼
PostgreSQL
```

O frontend não deverá acessar diretamente as tabelas operacionais do TagPulse.

Isso preservará:

* regras de negócio;
* autorização;
* validações;
* controle de consultas;
* evolução da estrutura interna;
* isolamento entre clientes.

---

# 7. Backend

## Decisão

Utilizar:

**Node.js + TypeScript + Fastify**

---

## 7.1. Motivos

Fastify oferece:

* arquitetura simples;
* bom desempenho;
* tipagem adequada;
* plugins;
* validação de schemas;
* baixo overhead;
* facilidade de testes;
* boa organização modular.

Além disso, o modelo já foi utilizado em outros projetos do ecossistema do usuário, reduzindo custo de aprendizado.

---

# 8. Organização do backend

O backend será organizado por módulos de domínio.

Exemplo inicial:

```text
backend/
└── src/
    ├── app/
    ├── config/
    ├── database/
    ├── integrations/
    │   └── tagplus/
    ├── modules/
    │   ├── companies/
    │   ├── connections/
    │   ├── customers/
    │   ├── products/
    │   ├── orders/
    │   └── sync/
    ├── shared/
    └── server.ts
```

A estrutura deverá crescer conforme necessidades reais.

Não deverão ser criadas dezenas de camadas antecipadamente.

---

# 9. Integração TagPlus

Todo conhecimento específico da API TagPlus deverá ficar isolado em:

```text
integrations/tagplus/
```

Exemplo:

```text
integrations/
└── tagplus/
    ├── tagplus-client.ts
    ├── tagplus-auth.ts
    ├── tagplus-pagination.ts
    ├── tagplus-types.ts
    └── resources/
```

Esse módulo será responsável por:

* autenticação;
* chamadas HTTP;
* paginação;
* rate limiting;
* retries;
* contratos externos;
* comportamento específico da API.

Ele não deverá conter lógica de dashboard ou regras de negócio específicas da Nineclouds.

---

# 10. ORM e acesso a dados

## Decisão

Utilizar inicialmente:

**Prisma**

O Prisma será utilizado para:

* migrations;
* modelos;
* acesso tipado;
* operações CRUD;
* transações comuns;
* desenvolvimento rápido.

---

## 10.1. Limite da abstração

Prisma não deverá impedir uso de SQL quando SQL for a ferramenta mais adequada.

O TagPulse terá características analíticas.

Portanto, será permitido utilizar:

* raw SQL;
* views;
* materialized views;
* CTEs;
* window functions;
* consultas agregadas especializadas.

Regra:

> Prisma para produtividade. SQL quando o problema for naturalmente SQL.

---

# 11. Migrations

Todas as alterações estruturais do banco deverão ser versionadas.

Não será permitido alterar manualmente a estrutura do banco de produção sem migration correspondente.

Fluxo:

```text
schema change
     ↓
migration
     ↓
Git
     ↓
environment deployment
```

---

# 12. Frontend

## Decisão

Utilizar:

**React + TypeScript + Vite**

---

## 12.1. Objetivo inicial

O frontend não será prioridade durante o primeiro milestone de ingestão.

Inicialmente o objetivo será comprovar:

```text
TagPlus API
     ↓
Backend
     ↓
PostgreSQL
```

A interface visual será adicionada depois que a fundação dos dados estiver comprovada.

---

# 13. API interna

O backend disponibilizará uma API própria para o frontend.

Exemplo futuro:

```text
/api/companies
/api/customers
/api/products
/api/orders
/api/dashboard
/api/sync
```

A API interna não deverá simplesmente replicar os endpoints do TagPlus.

Ela representará os conceitos e necessidades do TagPulse.

---

# 14. Monorepo

## Decisão

Utilizar um monorepo simples.

Estrutura inicial:

```text
tagpulse/
│
├── backend/
├── frontend/
├── docs/
├── .gitignore
└── README.md
```

Não será introduzido inicialmente:

* Nx;
* Turborepo;
* Lerna;
* workspace orchestration complexa.

Caso o projeto cresça ao ponto de justificar essas ferramentas, a decisão poderá ser revista.

---

# 15. Estrutura documental

A documentação seguirá:

```text
docs/
│
├── PROJECT-VISION.md
│
├── ADR/
│   └── ADR-001-stack-and-project-structure.md
│
├── SPEC/
│
└── PLAN/
```

Convenções:

```text
ADR   → decisões arquiteturais
SPEC  → contratos e comportamento esperado
PLAN  → plano de implementação
```

---

# 16. Configuração de ambientes

O TagPulse deverá suportar desde o início pelo menos:

```text
development
production
```

Um ambiente separado de homologação poderá ser adicionado quando necessário.

---

# 17. Variáveis de ambiente

Credenciais nunca deverão ser versionadas.

Exemplo:

```text
DATABASE_URL=
TAGPLUS_BASE_URL=
TAGPLUS_CLIENT_ID=
TAGPLUS_CLIENT_SECRET=
TAGPLUS_ACCESS_TOKEN=
```

Os nomes definitivos dependerão do modelo real de autenticação utilizado pelo TagPlus.

O repositório deverá conter apenas:

```text
.env.example
```

sem valores secretos.

---

# 18. Empresas e instalações TagPlus

Mesmo que inicialmente exista apenas a Nineclouds, o banco deverá possuir desde cedo um conceito de empresa.

Exemplo conceitual:

```text
Company
```

E um conceito separado de conexão/instância TagPlus:

```text
TagPlusConnection
```

Relação:

```text
Company
   │
   ├── TagPlus Current
   ├── TagPlus Legacy 1
   └── TagPlus Legacy 2
```

Isso evita codificar a Nineclouds diretamente no núcleo do produto.

---

# 19. Credenciais TagPlus

Credenciais deverão pertencer à conexão TagPlus e não ao código.

Conceitualmente:

```text
Company
   │
   ▼
TagPlusConnection
   │
   ├── environment
   ├── status
   ├── credentials
   └── sync configuration
```

A forma definitiva de armazenamento seguro das credenciais será definida posteriormente.

---

# 20. Sincronização

O mecanismo de sincronização fará parte do backend.

Não será criado inicialmente um microsserviço separado.

Arquitetura:

```text
TagPulse Backend
    │
    ├── HTTP API
    │
    └── Sync Engine
```

Se volume ou operação futura justificar separação, o Sync Engine poderá ser transformado em worker independente.

Não devemos antecipar essa complexidade.

---

# 21. Processamento assíncrono

Nenhuma infraestrutura de fila será adotada inicialmente.

Não serão introduzidos neste momento:

* Kafka;
* RabbitMQ;
* Redis Queue;
* BullMQ.

O primeiro milestone poderá executar sincronizações através do próprio backend.

Filas poderão ser introduzidas posteriormente caso existam necessidades como:

* grandes volumes;
* jobs longos;
* paralelismo;
* retry desacoplado;
* múltiplos clientes;
* processamento contínuo.

---

# 22. Camada RAW

## Decisão

O TagPulse não possuirá inicialmente uma camada RAW permanente equivalente à arquitetura do Stratix.

Entretanto, isso não significa descartar evidência da API antes de entendê-la.

Durante descoberta e desenvolvimento poderão existir:

* fixtures;
* snapshots;
* logs sanitizados;
* respostas de teste;
* amostras controladas.

O banco principal deverá armazenar os dados estruturados necessários ao produto.

Caso no futuro seja comprovada uma necessidade operacional de preservar payloads completos da API, essa decisão poderá ser revista através de novo ADR.

---

# 23. Observabilidade

O primeiro estágio deverá possuir pelo menos logs estruturados para:

```text
application startup
TagPlus requests
sync start
sync finish
records fetched
records inserted
records updated
errors
checkpoint advancement
```

Não será implementada inicialmente uma plataforma completa de observabilidade.

---

# 24. Testes

## Decisão

Utilizar:

**Vitest**

O projeto deverá possuir desde cedo:

* testes unitários;
* testes da integração TagPlus com mocks;
* testes do processo de mapeamento;
* testes de idempotência;
* testes de persistência quando necessário.

Os primeiros milestones deverão privilegiar testes sobre as partes críticas da ingestão.

---

# 25. Desenvolvimento assistido por IA

O projeto será desenvolvido através de ferramentas de IA, seguindo documentação arquitetural controlada.

Fluxo:

```text
ADR / SPEC / PLAN
        ↓
Prompt de implementação
        ↓
Codex ou Antigravity
        ↓
Diff
        ↓
Testes
        ↓
Revisão
        ↓
Commit
```

A ferramenta de implementação não deverá tomar decisões arquiteturais importantes implicitamente.

Quando uma decisão relevante surgir durante implementação, ela deverá ser avaliada antes de ser incorporada ao projeto.

---

# 26. Reaproveitamento do Stratix

O repositório Stratix não será utilizado como base para criar o TagPulse.

O TagPulse terá seu próprio repositório.

Entretanto, durante o desenvolvimento será permitido consultar o Stratix para recuperar conhecimento já validado sobre:

* autenticação TagPlus;
* endpoints;
* paginação;
* campos;
* retries;
* checkpoints;
* comportamento real da API.

Código poderá ser copiado ou adaptado somente após avaliação explícita.

---

# 27. Decisões deliberadamente adiadas

Não serão decididos neste ADR:

* modelo completo de dados;
* schemas de clientes;
* schemas de produtos;
* schemas de pedidos;
* estrutura de estoque;
* modelo financeiro;
* reconciliação dos dumps;
* autenticação dos usuários finais;
* multi-tenancy completo;
* billing;
* deploy definitivo;
* scheduler de produção;
* sistema de filas.

Essas decisões serão tomadas quando houver evidência suficiente.

---

# 28. Estrutura inicial esperada

Após o bootstrap:

```text
tagpulse/
│
├── backend/
│   ├── src/
│   ├── prisma/
│   ├── tests/
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
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
│   ├── SPEC/
│   └── PLAN/
│
├── .gitignore
└── README.md
```

---

# 29. Consequências positivas

Esta decisão oferece:

* stack conhecida e madura;
* velocidade de desenvolvimento;
* aprendizado prático de Supabase;
* banco PostgreSQL padrão;
* baixa dependência de fornecedor;
* frontend e backend tipados;
* integração simples com ferramentas de IA;
* possibilidade de usar SQL avançado;
* estrutura adequada para crescimento;
* baixa complexidade inicial.

---

# 30. Riscos

### Dependência excessiva do Supabase

Mitigação:

Utilizar PostgreSQL como contrato principal do backend.

### Prisma limitar consultas analíticas

Mitigação:

Permitir SQL nativo sempre que necessário.

### Arquitetura crescer demais prematuramente

Mitigação:

Novos componentes somente deverão ser introduzidos quando resolverem problemas concretos.

### Código específico da Nineclouds entrar no núcleo

Mitigação:

Separar conceitos de empresa, conexão e domínio TagPlus desde o início.

---

# 31. Resultado

A stack oficial inicial do TagPulse será:

```text
React + Vite + TypeScript
              │
              ▼
Node.js + Fastify + TypeScript
              │
              ▼
Prisma / SQL
              │
              ▼
PostgreSQL
              │
              ▼
Supabase
```

O produto será desenvolvido como monorepo simples e começará priorizando a integração confiável entre:

```text
TagPlus API → TagPulse Backend → PostgreSQL
```

antes da construção da experiência completa de frontend.

---

# 32. Próximo passo

Com este ADR aceito, o próximo documento será:

**PLAN-001 — Bootstrap do Projeto TagPulse**

Esse plano terá como objetivo criar o repositório, instalar a stack escolhida, preparar a conexão com PostgreSQL/Supabase e deixar o projeto pronto para a primeira integração real com a API TagPlus.

Nenhuma lógica de sincronização de clientes deverá ser implementada ainda no PLAN-001.