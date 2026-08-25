# TagPulse — Visão do Produto e Arquitetura Inicial

**Documento:** PROJECT-VISION
**Status:** Inicial
**Projeto:** TagPulse
**Primeira implantação:** Nineclouds

---

## 1. Visão do produto

O **TagPulse** é uma plataforma especializada em dados, inteligência e operações para empresas que utilizam o ERP TagPlus.

Seu objetivo é transformar os dados disponíveis no TagPlus em uma base própria, confiável e estruturada, sobre a qual possam ser construídos dashboards, análises, indicadores, inteligência de negócio e funcionalidades operacionais.

A primeira implantação do TagPulse será realizada na **Nineclouds**, utilizando dados reais de sua operação.

Entretanto, o produto não deve ser arquiteturalmente dependente da Nineclouds.

A arquitetura deve permitir que, futuramente, outras empresas usuárias do TagPlus possam utilizar o TagPulse sem que seja necessário reconstruir o núcleo da aplicação.

---

## 2. Relação entre TagPulse e Stratix

TagPulse e Stratix são projetos independentes e possuem objetivos diferentes.

### Stratix

O Stratix permanece como uma plataforma genérica e multi-ERP.

Seu problema central é:

> Como descobrir, interpretar, normalizar e utilizar dados provenientes de diferentes ERPs e fontes desconhecidas?

Por isso, sua arquitetura justifica componentes como:

* descoberta técnica;
* catálogo de recursos;
* identidade de fontes;
* camada RAW;
* normalização estrutural;
* mapeamento semântico;
* modelos independentes do ERP;
* conectores extensíveis;
* arquitetura multi-fonte.

O desenvolvimento do Stratix continuará seguindo essa direção.

### TagPulse

O TagPulse parte de uma premissa diferente:

> O sistema de origem é conhecido: TagPlus.

Portanto, não existe necessidade de reconstruir no TagPulse toda a arquitetura genérica desenvolvida para o Stratix.

O TagPulse deverá conhecer profundamente o TagPlus e explorar essa especialização para obter:

* desenvolvimento mais rápido;
* arquitetura mais simples;
* maior precisão;
* menor quantidade de abstrações;
* acesso direto às características específicas do ERP;
* evolução orientada às necessidades reais dos usuários TagPlus.

---

## 3. Princípio arquitetural

A arquitetura do TagPulse deverá seguir o princípio:

> **Especializar onde o domínio é conhecido. Abstrair somente quando existir necessidade real.**

Não deverão ser introduzidas abstrações apenas para tornar o sistema teoricamente compatível com outros ERPs.

O TagPulse é um produto especializado no TagPlus.

Por isso, inicialmente não serão necessárias:

* camada automática de descoberta de ERP;
* catálogo técnico genérico;
* mapeamento semântico dinâmico;
* modelo canônico universal;
* pipeline genérico multi-ERP;
* camada RAW permanente como requisito arquitetural.

A ausência dessas camadas é uma decisão deliberada de arquitetura, e não uma limitação do produto.

---

## 4. Arquitetura de alto nível

O fluxo principal será:

```text
TagPlus
   │
   │ REST API
   ▼
TagPulse Sync Engine
   │
   ▼
PostgreSQL
   │
   ├── Clientes
   ├── Produtos
   ├── Pedidos
   ├── Itens
   ├── Categorias
   ├── Estoque
   ├── Financeiro
   └── demais domínios suportados
   │
   ▼
Serviços e Regras de Negócio
   │
   ▼
TagPulse
   │
   ├── Dashboards
   ├── Analytics
   ├── Indicadores
   ├── Operações
   └── Inteligência
```

A API do TagPlus será a fonte primária dos dados atuais.

O PostgreSQL do TagPulse será a base própria utilizada pela aplicação para consultas, relacionamentos, cálculos e funcionalidades analíticas e operacionais.

---

## 5. Banco de dados

O TagPulse utilizará **PostgreSQL**.

A utilização do **Supabase**, que utiliza PostgreSQL, será avaliada separadamente no ADR de definição da stack.

A decisão entre PostgreSQL gerenciado diretamente e Supabase não deverá alterar os princípios arquiteturais deste documento.

O banco deverá representar os domínios conhecidos do TagPlus de forma clara e pragmática.

Exemplos conceituais:

```text
customers
products
orders
order_items
categories
suppliers
accounts_receivable
accounts_payable
inventory
```

Os nomes, relacionamentos e estruturas definitivos somente serão definidos depois da inspeção dos contratos e respostas reais da API.

---

## 6. Fidelidade aos dados da API

Um aprendizado importante obtido durante o desenvolvimento do Stratix deverá ser preservado no TagPulse:

> Não devemos assumir que conhecemos todos os campos retornados pela API antes de inspecionar as respostas reais.

Em experiências anteriores, a integração com a API não identificava inicialmente todos os campos disponíveis.

Por isso, antes da modelagem definitiva de cada recurso, o TagPulse deverá realizar uma inspeção completa das respostas reais do endpoint correspondente.

O objetivo é evitar:

* perda silenciosa de campos;
* modelagem baseada apenas em documentação incompleta;
* descarte prematuro de informações;
* necessidade posterior de reconstrução da ingestão.

A especialização no TagPlus deve aumentar a fidelidade aos dados, e não reduzi-la.

---

## 7. Sincronização com o TagPlus

O TagPulse deverá possuir um mecanismo próprio de sincronização.

Fluxo conceitual:

```text
TagPlus API
     │
     ▼
API Client
     │
     ▼
Fetcher / Pagination
     │
     ▼
Mapper
     │
     ▼
Upsert
     │
     ▼
PostgreSQL
```

Sempre que a API permitir, a sincronização deverá ser incremental.

Embora o TagPulse tenha arquitetura mais simples que o Stratix, alguns princípios comprovadamente importantes deverão ser preservados:

* idempotência;
* checkpoints;
* paginação segura;
* retries;
* tratamento de rate limits;
* observabilidade;
* registro das execuções;
* tratamento explícito de falhas;
* capacidade de reprocessamento;
* prevenção contra perda silenciosa de dados.

Esses mecanismos deverão ser implementados de forma proporcional à necessidade do TagPulse, sem transportar automaticamente toda a infraestrutura genérica do Stratix.

---

## 8. Múltiplas instalações TagPlus

A primeira implantação possui uma característica importante.

A Nineclouds possui dados provenientes de diferentes períodos de utilização do TagPlus:

```text
TagPlus histórico A
        │
       DUMP

TagPlus histórico B
        │
       DUMP

TagPlus atual
        │
       API
```

O TagPulse deverá ser projetado desde o início sabendo que dados do mesmo cliente podem vir de diferentes instâncias históricas do TagPlus.

Além disso, uma futura utilização comercial do TagPulse poderá envolver outras empresas com suas próprias instalações do ERP.

Por isso, registros importados não deverão depender exclusivamente do ID interno fornecido pelo TagPlus.

---

## 9. Identidade da origem

O modelo deverá preservar a procedência dos registros.

Conceitualmente, deverão existir informações equivalentes a:

```text
tenant / company
source_instance
source_entity
source_record_id
```

Exemplo:

```text
Nineclouds
tagplus_current
customer
1234
```

e:

```text
Nineclouds
tagplus_legacy_1
customer
1234
```

Os dois registros não deverão ser considerados automaticamente a mesma entidade apenas porque possuem o mesmo ID `1234`.

Essa separação permitirá:

* importar diferentes dumps;
* sincronizar a API atual;
* rastrear a origem de cada registro;
* evitar colisões de IDs;
* reconstruir históricos;
* futuramente suportar outras empresas.

A implementação concreta dessa identidade será definida no modelo de dados.

---

## 10. Consolidação histórica

O objetivo futuro para a Nineclouds será construir uma visão histórica consolidada de toda sua utilização do TagPlus.

O fluxo esperado será:

```text
TagPlus Legacy 1 ── Dump ──┐
                           │
TagPlus Legacy 2 ── Dump ──┼──► TagPulse Database
                           │
TagPlus Atual ───── API ───┘
```

Entretanto:

> **Importar dados não significa automaticamente afirmar que entidades provenientes de diferentes bases representam a mesma entidade de negócio.**

Exemplo:

Um cliente existente em dois bancos históricos poderá ser identificado posteriormente como a mesma pessoa através de CPF/CNPJ ou outras regras confiáveis.

Da mesma forma, produtos poderão exigir critérios próprios de correspondência.

Essa reconciliação deverá ser tratada explicitamente quando chegarmos à fase de histórico.

Ela não deverá bloquear o desenvolvimento da integração com a API atual.

---

## 11. Importação dos dumps históricos

A importação dos dumps não faz parte do primeiro milestone do TagPulse.

Entretanto, a arquitetura deverá permitir sua implementação futura.

O fluxo conceitual será:

```text
TagPlus Dump
     │
     ▼
Dump Reader
     │
     ▼
TagPlus Historical Mapper
     │
     ▼
PostgreSQL
```

Os dados históricos deverão convergir para os mesmos domínios utilizados pelos dados atuais sempre que semanticamente compatíveis.

O objetivo é evitar manter permanentemente dois universos independentes:

```text
dados históricos
versus
dados da API
```

Para o usuário do TagPulse, após reconciliação, deverá ser possível analisar a evolução histórica do negócio de maneira integrada.

---

## 12. Preparação para outros clientes TagPlus

O TagPulse não precisa nascer como uma plataforma SaaS multi-tenant completa.

Entretanto, decisões estruturais que tornariam impossível ou muito custoso atender outra empresa TagPlus deverão ser evitadas.

A regra será:

> **Preparar para múltiplos clientes sem implementar antecipadamente a complexidade de um SaaS completo.**

Isso significa, por exemplo:

* não codificar regras centrais diretamente para Nineclouds;
* separar configuração de cliente de regras do TagPlus;
* preservar identificação da empresa;
* preservar identificação da instância TagPlus;
* evitar IDs globalmente baseados apenas no ID do ERP;
* separar credenciais e configurações de conexão.

Não significa, neste momento:

* construir billing;
* construir onboarding comercial;
* implementar isolamento SaaS completo;
* criar planos de assinatura;
* desenvolver administração multiempresa;
* construir infraestrutura que ainda não seja necessária.

---

## 13. Nineclouds como primeira implantação

A Nineclouds será o ambiente inicial de desenvolvimento e validação do TagPulse.

Isso representa uma vantagem importante.

O produto poderá ser construído utilizando:

* API real;
* dados reais;
* problemas reais;
* histórico real;
* necessidades reais de gestão;
* validações diretamente contra o ERP.

A Nineclouds funcionará como **primeiro caso real do produto**, e não como definição arquitetural do produto.

Sempre que uma funcionalidade surgir de uma necessidade específica da Nineclouds, deverá ser feita a seguinte pergunta:

> Isso pertence ao núcleo do TagPulse ou é uma customização da implantação Nineclouds?

Essa distinção deverá ser preservada ao longo do desenvolvimento.

---

## 14. Reaproveitamento do Stratix

O TagPulse será um projeto novo.

Não deverá existir dependência arquitetural entre os dois sistemas.

Entretanto, o trabalho realizado no Stratix representa conhecimento valioso sobre o TagPlus.

Poderão ser reaproveitados conhecimentos relacionados a:

* autenticação;
* endpoints;
* paginação;
* comportamento real da API;
* campos descobertos;
* limitações;
* rate limits;
* sincronização;
* retries;
* checkpoints;
* dados reais;
* relacionamentos;
* regras já comprovadas.

Código do Stratix poderá ser reutilizado somente quando houver vantagem clara e quando sua utilização não transportar complexidade desnecessária.

Princípio:

> **Reaproveitar conhecimento por padrão. Reaproveitar código por decisão.**

---

## 15. Primeiro milestone

O primeiro milestone técnico do TagPulse será propositalmente pequeno.

### Objetivo

Conectar à API real do TagPlus, sincronizar integralmente um recurso e persistir seus dados corretamente no PostgreSQL.

A primeira entidade candidata é:

```text
clientes
```

Fluxo:

```text
GET /clientes
      │
      ▼
paginação completa
      │
      ▼
inspeção dos campos reais
      │
      ▼
persistência
      │
      ▼
PostgreSQL
      │
      ▼
consulta e validação
```

### Critérios mínimos de sucesso

* autenticação funcionando;
* endpoint real acessível;
* paginação completa;
* todos os registros disponíveis recuperados;
* estrutura real das respostas inspecionada;
* nenhum campo descartado silenciosamente;
* dados persistidos;
* origem dos registros preservada;
* segunda execução idempotente;
* execução registrada;
* erros observáveis;
* resultado validado contra a API.

---

## 16. Estratégia de desenvolvimento

O TagPulse será desenvolvido utilizando desenvolvimento assistido por IA, seguindo a dinâmica já utilizada com sucesso em projetos anteriores.

Fluxo:

```text
Definição arquitetural
        │
        ▼
Documento / ADR / SPEC / PLAN
        │
        ▼
Prompt de implementação
        │
        ▼
Codex / Antigravity
        │
        ▼
Implementação
        │
        ▼
Testes e evidências
        │
        ▼
Revisão
        │
        ▼
Checkpoint
        │
        ▼
Próxima etapa
```

As ferramentas de implementação deverão trabalhar sobre decisões previamente documentadas.

Grandes implementações sem checkpoint deverão ser evitadas.

A preferência será por ciclos pequenos, verificáveis e reversíveis.

---

## 17. Princípios do TagPulse

### Especialização

Conhecer profundamente o TagPlus é uma vantagem arquitetural.

### Fidelidade

Nenhum dado relevante deverá ser perdido por simplificação prematura.

### Simplicidade

Complexidade deverá existir somente quando resolver um problema concreto.

### Rastreabilidade

Todo dado deverá possuir origem identificável.

### Idempotência

Reexecutar uma sincronização não deverá corromper ou duplicar dados.

### Evolução incremental

O produto deverá crescer através de milestones pequenos e comprovados.

### Separação

TagPulse e Stratix permanecem produtos arquiteturalmente independentes.

### Generalização controlada

O TagPulse poderá atender diferentes clientes TagPlus, mas não deverá tentar resolver problemas de ERPs desconhecidos.

---

## 18. Critério para decisões futuras

Sempre que uma nova abstração ou componente arquitetural for proposto, deverão ser feitas três perguntas:

1. **Isso resolve um problema real do TagPulse?**
2. **Isso é necessário porque trabalhamos com TagPlus ou estamos recriando uma abstração do Stratix?**
3. **Podemos implementar uma solução mais simples sem comprometer precisão, rastreabilidade ou evolução futura?**

Se uma complexidade existir apenas para tornar o TagPulse genericamente compatível com ERPs desconhecidos, ela provavelmente pertence ao **Stratix**, não ao TagPulse.

---

## 19. Próximos documentos

A evolução inicial prevista é:

```text
docs/
│
├── PROJECT-VISION.md
│
├── ADR/
│   └── ADR-001-stack-and-project-structure.md
│
├── SPEC/
│   └── SPEC-001-tagplus-api-contract.md
│
└── PLAN/
    ├── PLAN-001-project-bootstrap.md
    └── PLAN-002-customer-sync.md
```

A ordem inicial será:

**PROJECT-VISION → ADR-001 → PLAN-001 → SPEC-001 → primeira implementação real.**

Nenhum código de aplicação deverá ser criado antes da definição do ADR-001 e do PLAN-001.