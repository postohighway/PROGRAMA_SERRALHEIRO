# Análise de Inconsistências e Gaps Premium – SGB Serralheria

## 1. Correções já implementadas

| Correção | Arquivo | Descrição |
|----------|---------|-----------|
| Integração budgets no financeiro | financeiro.js | DRE e Obras agora consideram budgets além de quotes |
| Receivables ao aprovar budget | budgets.js | Cria conta a receber automaticamente ao aprovar orçamento |
| Compras pagas → fluxo de caixa | compras.js | Marcar compra como paga insere em `txs` |
| Relatório ordens com budget_id | relatorios.js | Relatório de ordens finalizadas exibe quote_id ou budget_id |

---

## 2. Inconsistências restantes (baixa prioridade)

### 2.1 Scripts ausentes no index.html
- **data.js** e **data.customers.js** são referenciados mas não existem na raiz
- **Ação:** Criar stubs vazios ou remover do index.html se não forem usados

### 2.2 Nomenclatura customer_id vs client_id
- `workorders` usa `client_id`; `receivables`, `quotes`, `customers` usam `customer_id`
- **Impacto:** Baixo – o código já trata os dois casos
- **Ação futura:** Padronizar em migration (ex.: renomear `client_id` → `customer_id` em workorders)

### 2.3 Compras: orçamento da OS
- `compras.js` busca orçamento apenas por `quote_id`; OS vindas de budgets têm `budget_id`
- **Ação:** Incluir busca por `budget_id` quando `quote_id` for nulo (para KPI "Orçamento da OS")

---

## 3. Gaps para produto premium (financeiro)

### 3.1 Funcionalidades ausentes

| Funcionalidade | Situação | Prioridade |
|----------------|----------|------------|
| **Export DRE/Fluxo** | Não há export CSV/PDF no financeiro | Alta |
| **Saldo inicial** | Fluxo de caixa começa do zero; não há saldo de abertura | Alta |
| **Lançamento manual em txs** | Não há tela para lançar entradas/saídas manuais | Alta |
| **Conciliação bancária** | Mencionada em relatórios, mas sem tela ou fluxo | Média |
| **Contas múltiplas** | Tudo em uma única "conta"; sem conceito de conta bancária | Média |
| **Regime competência vs caixa** | Não configurável; tudo tratado como caixa | Média |
| **Baixa de recebíveis** | Não há fluxo explícito no financeiro para dar baixa em receivable | Média |
| **Centro de custo** | Não há categorização por centro de custo | Baixa |

### 3.2 Melhorias recomendadas (sem alterar design)

1. **Export:** Botões "Exportar CSV" nas abas Executivo, DRE, Fluxo de Caixa e Contas a Receber
2. **Saldo inicial:** Campo configurável por período (ex.: "Saldo em 01/03") somado ao fluxo
3. **Lançamento manual:** Modal/tela para inserir em `txs` (tipo, valor, data, descrição, categoria)
4. **Compras – orçamento da OS:** Em `compras.js`, ao calcular `orcamentoTotal`, buscar também por `budget_id` quando `quote_id` for nulo

---

## 4. Resumo de tabelas e fluxos

| Tabela | Populada por | Usada no financeiro |
|--------|--------------|----------------------|
| receivables | orcamentos (quotes), budgets (novo) | DRE, Obras, Contas a Receber |
| payments | pagamentos de clientes | Obras, Executivo |
| purchases | compras | DRE, Obras, Executivo |
| quotes | orcamentos (ModuloOrcamentos) | DRE, Obras |
| budgets | budgets, pipeline | DRE, Obras (novo) |
| workorders | ordens, budgets, orcamentos | Obras |
| txs | despesas (ao pagar), compras (ao pagar – novo) | Fluxo de Caixa, DRE |
| expenses | despesas, compras (via sync) | Contas a Pagar |

---

## 5. Próximos passos sugeridos

1. Implementar busca por `budget_id` em compras para o KPI de orçamento
2. Criar `data.js` e `data.customers.js` vazios ou remover do index
3. Adicionar export CSV nas abas do financeiro
4. Avaliar saldo inicial e lançamento manual em `txs` para versão premium
