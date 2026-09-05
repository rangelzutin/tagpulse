# PLAN-005 — Phase A: Discovery Checkpoint & Sales Control-Case Evidence

**Projeto:** TagPulse  
**Fase:** PLAN-005 — Phase A (Fechamento do Discovery de Vendas / Casos de Controle)  
**Status:** CLOSED (Phase A concluída com sucesso; Phase B não iniciada)  
**Data:** 2026-09-05  

---

## 1. Contexto e Objetivo

O objetivo da Fase A do PLAN-005 foi realizar a descoberta empírica mínima e direcionada dos recursos comerciais e de faturamento da API TagPlus v2 através de um caso de controle real e rastreável:
* **Pedido visível 1239**
* **Venda Simples visível 626**
* **NF-e visível 2713 (série 1)**

Nenhuma persistência, migração de banco de dados ou varredura em massa foi executada. O trabalho foi estritamente investigativo e estrutural.

---

## 2. Recursos Oficiais e Escopos da API TagPlus

Confirmados via documentação oficial OpenAPI / Swagger (`https://tagsoft.tagplus.com.br/resources/swagger/api.yaml`, `paths/nfes.yaml` e `definitions/nfe.yaml`):

| Recurso | Collection Endpoint | Detail Endpoint | Escopo OAuth2 (Leitura) |
| :--- | :--- | :--- | :--- |
| **Pedidos** | `GET /pedidos` | `GET /pedidos/{id}` | `read:pedidos` |
| **Vendas Simples** | `GET /vendas_simples` | `GET /vendas_simples/{id}` | `read:vendas_simples` |
| **NF-e** | `GET /nfes` | `GET /nfes/{id}` | `read:nfes` |

---

## 3. Descoberta Estrutural do Caso de Controle

### 3.1. Identidade: Número Visível ≠ ID Real de API
A inspeção comprovou empiricamente que o número visível de controle (número comercial/fiscal) não é igual ao identificador primário interno (`id`) da API:

* **Pedido:** número visível `1239` $\rightarrow$ API `id: 1282`
* **Venda Simples:** número visível `626` $\rightarrow$ API `id: 7022`
* **NF-e:** número visível `2713` (série 1) $\rightarrow$ API `id: 2816`

### 3.2. Vínculos Explícitos [OBSERVED]

Tanto a Venda Simples quanto a NF-e apontam estruturalmente e de forma explícita para o Pedido 1239:

* **Na Venda Simples 626 (`id: 7022`):**
  ```json
  "pedido_os_vinculada": {
    "id": 1282,
    "numero": 1239,
    "tipo": "NF"
  }
  ```
  Adicionalmente, as parcelas financeiras apontam para o documento `2713`:
  `faturas[0].parcelas[0].documento = "000002713001"`

* **Na NF-e 2713 (`id: 2816`):**
  ```json
  "pedido_os_vinculada": {
    "id": 1282,
    "numero": 1239,
    "tipo": "NF"
  },
  "numero_pedido": "1239"
  ```

### 3.3. Clientes e Produtos Compartilhados
Todos os 3 documentos compartilham referências consistentes:
* **Cliente:** `cliente.id = 507` (mesma entidade de destino).
* **Produtos:** Identificados consistentemente através de `produto_servico.id` (ex: shape Nineclouds `produto_servico.id = 2152`, código `2086689434242`).
* **Identidade dos Itens:** Identificador primário próprio para cada linha em `itens[].id`.

### 3.4. Campos Relevantes de Itens Observados
* `qtd`
* `valor_unitario`
* `valor_desconto`
* `valor_subtotal`

### 3.5. Comparativo Quantitativo e Financeiro

| Documento | Recurso API | API ID | Itens | Totais Relevantes | Observações |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Pedido 1239** | `pedidos` | `1282` | 25 itens | `valor_total = 14242.50`<br>`valor_desconto = 2617.50` | `possui_vinculo = true`, `status = "A"` |
| **Venda Simples 626** | `vendas_simples` | `7022` | 25 itens | `valor_total = 7120.97`<br>`valor_desconto = 2617.78` | Representa fatia operacional/comercial vinculada |
| **NF-e 2713 (série 1)** | `nfes` | `2816` | 24 itens | `valor_produtos = 7121.25`<br>`valor_nota = 7121.25` | `movimentacao_mercadoria = true` |

---

## 4. Conclusão Arquitetural

1. **Separação de Dimensões:**
   Realidade comercial, movimentação financeira e movimentação física de estoque são aspectos relacionados, mas **NÃO são equivalentes**.
2. **Prevenção de Duplicação Contábil/Comercial:**
   `Pedido` + `Venda Simples` + `NF-e` **NÃO** podem ser somados cegamente como 3 vendas independentes. Fazer isso geraria triplicação fictícia de receita e descontrole de métricas.
3. **Pedido como Hub:**
   No caso de controle analisado, o **Pedido 1239** funciona como o hub explícito e comum agregador, ao qual a Venda Simples 626 e a NF-e 2713 estão subordinadas.
4. **Próxima Etapa (Phase B):**
   A definição dos contratos definitivos de persistência de `Sale` / `SaleItem` e as regras formais de reconciliação/desduplicação pertencem à **Phase B**, não iniciada neste ponto.
