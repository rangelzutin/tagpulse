# PLAN-002 — Inspeção do Contrato de Clientes TagPlus

**Projeto:** TagPulse
**Dependência:** SPEC-001 — Contrato e Inspeção da API TagPlus
**Recurso piloto:** `clientes`
**Status:** Draft
**Objetivo:** obter evidência suficiente sobre o contrato real do recurso `clientes` para autorizar sua futura modelagem em PostgreSQL.

---

## 1. Objetivo

O PLAN-002 deverá executar, pela primeira vez, o protocolo definido no SPEC-001.

Ao final desta fase precisamos conseguir responder com confiança:

> Sabemos exatamente como o recurso `clientes` da API TagPlus se comporta e quais dados ele pode nos entregar?

Somente depois dessa resposta ser positiva será permitido criar o modelo Prisma correspondente.

---

# 2. Regra principal

Este plano **não cria ainda a tabela `Customer`**.

Também não implementa:

* sincronização completa;
* scheduler;
* atualização incremental;
* dashboards;
* relacionamentos definitivos;
* camada de domínio;
* histórico de alterações;
* abstrações genéricas de integração.

O objetivo é exclusivamente compreender o recurso `clientes`.

---

# 3. Resultado esperado

Ao final do plano deverão existir cinco resultados concretos:

1. conexão autenticada validada contra a API TagPlus;
2. comportamento de `/clientes` conhecido;
3. comportamento de `/clientes/{id}` conhecido, caso o endpoint exista;
4. inventário consolidado de todos os JSON paths observados;
5. decisão formal:

`READY_FOR_MODELING`

ou:

`PARTIALLY_UNDERSTOOD`

---

# 4. Estratégia geral

A investigação será executada em camadas.

```text
Autenticação
      │
      ▼
Endpoint validation
      │
      ▼
Collection inspection
      │
      ▼
Structural sampling
      │
      ▼
Individual record inspection
      │
      ▼
Field/type/nullability analysis
      │
      ▼
Documentation + Stratix comparison
      │
      ▼
Structural saturation
      │
      ▼
Contract Report
      │
      ▼
READY_FOR_MODELING
```

---

# 5. FASE A — Preparação da conexão

## Objetivo

Comprovar que o TagPulse consegue consultar a API TagPlus utilizando uma conexão real e controlada.

## A.1 — Credenciais

Configurar exclusivamente via ambiente:

* Client ID;
* Client Secret;
* access token quando aplicável;
* refresh token quando aplicável;
* redirect URI quando necessário;
* versão da API.

Nenhuma credencial deverá ser persistida em:

* Git;
* fixtures;
* documentação;
* logs;
* banco de desenvolvimento sem necessidade.

## A.2 — Company

A inspeção deverá utilizar a empresa Nineclouds já existente no banco TagPulse.

A conexão deverá estar vinculada logicamente à empresa, mesmo que o modelo definitivo de integrações ainda não seja criado nesta fase.

## A.3 — Validação mínima

Executar uma chamada autenticada simples.

Registrar:

* HTTP status;
* versão da API;
* endpoint consultado;
* timestamp;
* duração;
* resultado sanitizado.

## Gate A

A fase somente é aprovada se:

* autenticação funcionar;
* API responder;
* erros de autorização forem compreendidos;
* versão utilizada estiver explícita.

---

# 6. FASE B — Validação do endpoint `clientes`

## Objetivo

Confirmar empiricamente o comportamento básico do recurso.

Investigar:

`GET /clientes`

## B.1 — Endpoint

Validar:

* URL efetiva;
* método HTTP;
* scope necessário;
* resposta HTTP;
* formato do body;
* presença ou não de metadados;
* comportamento com parâmetros inválidos.

## B.2 — Paginação

Investigar explicitamente:

* `page`;
* `per_page`;
* tamanho máximo permitido;
* página inexistente;
* página vazia;
* última página;
* indicação de total de registros, se existir;
* indicação de próxima página, se existir;
* estabilidade de ordenação.

Não assumir comportamento com base apenas na documentação.

## B.3 — Ordenação implícita

Precisamos identificar se a coleção apresenta alguma ordenação aparente por:

* ID;
* criação;
* atualização;
* nome;
* outra chave.

Se não houver garantia contratual, registrar como:

`ordering: unspecified`

Isso será importante posteriormente para sincronização incremental.

## Gate B

Precisamos conseguir afirmar:

> Sabemos consultar clientes de forma paginada e previsível.

---

# 7. FASE C — Primeira leitura estrutural

## Objetivo

Criar a primeira fotografia do formato retornado pela coleção.

A inspeção deverá percorrer cada resposta recursivamente.

Para cada propriedade será produzido um JSON path.

Exemplo conceitual:

```text
id
nome
tipo
cpf
cnpj
email
endereco
endereco.logradouro
endereco.cidade
telefones[]
telefones[].numero
```

A nomenclatura exata dependerá das respostas reais.

## C.1 — Tipos

Registrar para cada path:

* `string`;
* `integer`;
* `number`;
* `boolean`;
* `object`;
* `array`;
* `null`.

Também identificar strings com aparência de:

* data;
* datetime;
* CPF;
* CNPJ;
* CEP;
* email;
* identificador.

Isso será apenas caracterização.

Não converter valores ainda.

## C.2 — Contadores

Para cada path:

```text
observed_count
missing_count
null_count
type_counts
```

Exemplo:

```text
email

records_analyzed: 500
observed_count:   420
missing_count:     80
null_count:        35

types:
string: 385
null:    35
```

Isso permitirá separar ausência de nulabilidade.

---

# 8. FASE D — Amostragem ampla

## Objetivo

Aumentar a diversidade estrutural observada.

Não estabeleceremos inicialmente um número rígido de clientes.

Começaremos com um volume suficiente para observar comportamento e continuaremos enquanto novos campos relevantes aparecerem.

## D.1 — Progressão inicial

Sugestão inicial:

```text
50 registros
100 registros
250 registros
500 registros
1.000 registros
```

Mas a quantidade é secundária.

O indicador principal será a descoberta de novos JSON paths.

## D.2 — Curva de descoberta

Após cada bloco:

```text
registros analisados
paths totais conhecidos
novos paths encontrados
```

Exemplo:

```text
50 registros    → 43 paths
100 registros   → +8
250 registros   → +3
500 registros   → +1
1.000 registros → +0
```

## D.3 — Saturação

Não considerar saturação após apenas uma rodada sem novidades.

A saturação deverá exigir múltiplos blocos consecutivos sem novos paths significativos.

A quantidade exata poderá ser ajustada empiricamente durante a primeira execução.

---

# 9. FASE E — Diversidade dirigida

Amostragem sequencial sozinha não é suficiente.

Precisamos tentar deliberadamente localizar diferentes classes de cliente.

## E.1 — PF × PJ

Localizar, quando existirem:

* pessoa física;
* pessoa jurídica.

Comparar os contratos observados.

## E.2 — Antigos × recentes

Selecionar registros de diferentes períodos.

Objetivo:

detectar campos introduzidos ou abandonados ao longo da evolução do ERP.

## E.3 — Completos × incompletos

Inspecionar:

* cadastro mínimo;
* cadastro altamente preenchido.

## E.4 — Ativos × inativos

Se houver essa distinção.

## E.5 — Estruturas especiais

Buscar registros contendo, caso existam:

* múltiplos telefones;
* múltiplos emails;
* múltiplos endereços;
* dados comerciais;
* observações;
* vendedor;
* listas ou relacionamentos;
* campos fiscais.

A estratégia deverá ser adaptada à estrutura efetivamente encontrada.

---

# 10. FASE F — Endpoint individual

Se a TagPlus disponibilizar:

`GET /clientes/{id}`

ele deverá ser investigado separadamente.

## F.1 — Comparação

Para o mesmo cliente:

```text
collection representation
        VS
individual representation
```

Classificar paths como:

```text
BOTH
COLLECTION_ONLY
DETAIL_ONLY
```

## F.2 — Amostra

Não consultar apenas um cliente individual.

Selecionar clientes estruturalmente diferentes identificados na fase anterior.

Por exemplo:

* PF simples;
* PF completo;
* PJ simples;
* PJ completo;
* registro antigo;
* registro recente.

## Gate F

Precisamos saber se o endpoint individual entrega uma representação mais rica que a coleção.

Essa resposta impactará diretamente a futura arquitetura de sincronização.

---

# 11. FASE G — Arrays

Arrays deverão receber atenção especial.

Para cada array registrar:

```text
path
empty_count
non_empty_count
null_count
max_observed_length
element_types
element_paths
```

Exemplo conceitual:

```text
enderecos[]

empty .............. 320
non-empty .......... 680
max length ......... 4

element paths:
enderecos[].id
enderecos[].cep
enderecos[].cidade
...
```

Um array vazio jamais será usado como prova de sua estrutura.

---

# 12. FASE H — Objetos aninhados

Objetos deverão ser inspecionados recursivamente.

Precisamos distinguir:

```text
field missing
```

de:

```json
"field": null
```

de:

```json
"field": {}
```

de:

```json
"field": {
  ...
}
```

Essas quatro situações representam comportamentos diferentes.

---

# 13. FASE I — Variação de tipos

Qualquer campo apresentando mais de um tipo real deverá ser destacado.

Exemplos:

```text
id → integer
```

é simples.

Mas:

```text
codigo → integer | string
```

é uma evidência importante.

Assim como:

```text
data_nascimento → string | null
```

ou:

```text
telefone → string | integer | null
```

Nenhuma inconsistência deverá ser corrigida durante a inspeção.

Primeiro registramos.

Depois decidimos como persistir.

---

# 14. FASE J — Fixtures

Criar fixtures somente para casos estruturalmente relevantes.

Sugestão inicial:

```text
cliente-pf-minimo.json
cliente-pf-completo.json
cliente-pj-minimo.json
cliente-pj-completo.json
cliente-antigo.json
cliente-recente.json
clientes-collection-page.json
```

Os nomes definitivos dependerão do que realmente existir.

## Sanitização

Alterar valores pessoais preservando:

* propriedade;
* tipo;
* nulabilidade;
* tamanho aproximado quando relevante;
* nesting;
* cardinalidade estrutural.

Nunca preservar:

* CPF real;
* CNPJ quando sensível;
* telefone real;
* email pessoal;
* endereço pessoal;
* tokens;
* secrets.

---

# 15. FASE K — Comparação com documentação TagPlus

Depois da inspeção runtime, comparar o resultado com a documentação.

Não fazer o inverso.

Isso evita que a documentação determine antecipadamente o que esperamos encontrar.

Classificar cada campo conhecido como:

```text
DOCUMENTED_AND_OBSERVED
DOCUMENTED_NOT_OBSERVED
OBSERVED_NOT_DOCUMENTED
```

A terceira categoria é especialmente importante.

Ela poderá revelar justamente o tipo de lacuna encontrado anteriormente no Stratix.

---

# 16. FASE L — Comparação com Stratix

O Stratix será utilizado como segunda fonte histórica.

Pesquisar especificamente o conhecimento acumulado sobre:

* clientes;
* endpoint;
* paginação;
* scopes;
* filtros;
* campos;
* estruturas;
* problemas encontrados.

Classificar evidências históricas como:

```text
CONFIRMED_IN_TAGPULSE
NOT_YET_OBSERVED
NO_LONGER_APPLICABLE
CONTRADICTED
```

O Stratix não será tratado como autoridade.

Será usado para perguntar:

> Já vimos alguma coisa no passado que nossa inspeção atual ainda não encontrou?

Isso é extremamente útil contra regressão de conhecimento.

---

# 17. FASE M — Contract Snapshot

Ao final da inspeção gerar um snapshot estrutural.

Conceitualmente:

```text
Resource: clientes
API Version: 2.0

Records inspected: 2.500
Collection pages: 25
Detail records: 30

Unique paths: 78

Scalar paths: 51
Object paths: 8
Array paths: 4
Nested paths: 15

Nullable paths: 23
Optional paths: 19
Type variations: 2

Observed undocumented fields: 4
Documented unobserved fields: 3

Structural saturation: YES
```

Os números acima são apenas ilustrativos.

---

# 18. FASE N — Resource Contract Report

Criar:

`docs/contracts/tagplus/clientes.md`

O documento deverá consolidar:

### Identidade

* recurso;
* endpoint;
* API version;
* scope.

### Collection Contract

Estrutura observada em `/clientes`.

### Detail Contract

Estrutura observada em `/clientes/{id}`.

### Pagination Contract

Comportamento confirmado.

### Fields

Inventário completo.

### Types

Tipos observados.

### Optionality

Missing × nullable.

### Nested structures

Objetos e arrays.

### Special cases

Particularidades encontradas.

### Documentation Delta

Diferenças da documentação.

### Stratix Delta

Diferenças em relação ao conhecimento histórico.

### Saturation Evidence

Curva de descoberta de paths.

### Known Unknowns

Tudo que ainda não conseguimos comprovar.

---

# 19. FASE O — Modeling Gate

O recurso `clientes` somente poderá receber:

`READY_FOR_MODELING`

se todas as condições abaixo forem atendidas.

* [ ] autenticação validada;
* [ ] endpoint de coleção validado;
* [ ] paginação validada;
* [ ] múltiplas páginas examinadas;
* [ ] diversidade temporal examinada;
* [ ] diversidade estrutural examinada;
* [ ] PF/PJ examinados quando aplicável;
* [ ] endpoint individual examinado quando existir;
* [ ] coleção × detalhe comparados;
* [ ] todos os JSON paths conhecidos inventariados;
* [ ] null × missing diferenciados;
* [ ] arrays investigados com elementos reais;
* [ ] objetos aninhados investigados;
* [ ] variações de tipo registradas;
* [ ] documentação confrontada;
* [ ] conhecimento Stratix confrontado;
* [ ] fixtures relevantes preservadas;
* [ ] evidência de saturação estrutural atingida;
* [ ] known unknowns explicitamente documentados;
* [ ] nenhuma lacuna crítica aberta.

Se alguma lacuna relevante permanecer:

`PARTIALLY_UNDERSTOOD`

e a modelagem deverá aguardar.

---

# 20. Estrutura técnica mínima

A implementação futura deste plano deverá permanecer pequena.

Não queremos construir um framework de discovery.

Uma estrutura possível:

```text
backend/
  src/
    integrations/
      tagplus/
        client/
        inspection/

  scripts/
    inspect-tagplus-customers.ts

  tests/
    fixtures/
      tagplus/
        customers/

docs/
  contracts/
    tagplus/
      clientes.md
```

A estrutura final poderá ser ajustada durante implementação.

O princípio é:

> ferramenta especializada, descartável ou reutilizável quando útil, sem transformar o TagPulse em plataforma de descoberta.

---

# 21. Persistência do resultado da inspeção

Nesta fase não existe necessidade de criar tabelas PostgreSQL para armazenar catálogo técnico.

Os resultados poderão inicialmente existir como:

* relatório Markdown;
* JSON de contrato;
* fixtures;
* saída de teste;
* arquivos de evidência.

Evitar criar:

```text
api_resources
api_fields
api_schema_catalog
```

a menos que um requisito operacional futuro demonstre necessidade real.

---

# 22. Proteção contra o problema ocorrido no Stratix

O PLAN-002 deverá provar especificamente que não estamos derivando o contrato de clientes a partir de:

```text
GET /clientes?per_page=1
```

ou de qualquer pequena amostra equivalente.

A homologação deverá incluir evidência da união estrutural de múltiplos registros.

Esse é um requisito de aceitação obrigatório.

---

# 23. Não objetivos

Este plano não deverá evoluir para:

* discovery universal;
* OpenAPI generator;
* schema inference genérico para qualquer API;
* mecanismo multi-ERP;
* semantic mapping;
* data lake;
* RAW repository;
* versionamento universal de schemas.

Sempre que surgir uma proposta desse tipo, ela deverá ser confrontada com a pergunta:

> Isso é necessário para integrar a TagPlus com alta fidelidade?

Se a resposta for não, fica fora do TagPulse.

---

# 24. Critérios de homologação

O PLAN-002 será considerado concluído quando houver evidência objetiva de:

### API

Chamadas reais executadas com sucesso.

### Pagination

Comportamento conhecido.

### Coverage

Amostra suficientemente diversa.

### Structure

Contrato observado consolidado.

### Detail

Diferenças coleção/item conhecidas.

### Fields

Nenhum path observado ficou fora do inventário.

### Types

Tipos e variações conhecidos.

### Optionality

Missing/null conhecidos.

### Nested data

Arrays e objetos investigados.

### Historical knowledge

Stratix confrontado com runtime atual.

### Documentation

Documentação confrontada com runtime atual.

### Fixtures

Casos estruturais importantes reproduzíveis.

### Saturation

Novas amostras deixaram de revelar novos campos relevantes.

### Decision

`clientes` recebeu status conclusivo.

---

# 25. Resultado seguinte

Caso:

`clientes = READY_FOR_MODELING`

o próximo artefato será:

# SPEC-002 — Modelo e Sincronização de Clientes

ou diretamente:

# PLAN-003 — Customer Persistence & Sync

dependendo da quantidade de decisões arquiteturais encontradas durante a inspeção.

Esse plano deverá então decidir:

* tabela Prisma;
* PK interna;
* ID TagPlus;
* constraints;
* tipos PostgreSQL;
* nullable;
* estruturas relacionais;
* arrays;
* timestamps;
* upsert;
* initial load;
* incremental sync;
* idempotência;
* deleted/inactive records;
* drift detection;
* métricas;
* testes.

Nenhuma dessas decisões deve ser antecipada no PLAN-002.

---

# 26. Princípio de encerramento

O PLAN-002 estará concluído quando não estivermos dizendo:

> “Acho que clientes têm estes campos.”

Mas sim:

> “Inspecionamos sistematicamente a API real, cobrimos diferentes tipos e períodos de registros, comparamos coleção e detalhe, cruzamos runtime, documentação e conhecimento histórico, atingimos saturação estrutural e conhecemos explicitamente as incertezas restantes.”

Somente nesse momento o TagPulse deverá transformar o recurso `clientes` em modelo de dados permanente.