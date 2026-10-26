# Critérios de apuração do faturamento

Fonte única: views SQL (`v_receitas`, `v_faturamento_mensal`, `v_cancelamentos`, `v_cobrancas`) e funções (`indicadores_cobranca`, `limite_situacao`, `resumo_contratos`). Dashboard, Faturamento, Limite e Relatórios usam as mesmas views, então os números coincidem.

**Regime adotado: competência.** Uma receita pertence ao mês da competência da cobrança (ou da data da venda), não ao mês do pagamento.

## O que entra no faturamento
| Componente | Regra |
|---|---|
| Mensalidades | `valor_base` de cobranças **faturadas** e **não canceladas**, no mês da competência |
| Adicionais | valor de cada adicional vinculado a cobranças faturadas e não canceladas |
| Vendas | itens (qtd × unitário − desconto) de vendas **faturadas ou recebidas**, no mês da data da operação |
| Devoluções/estornos | valor negativo, no mês da data do ajuste, sobre vendas faturadas/recebidas |

## O que NÃO entra
- **Pagamentos** (são caixa, indicador `recebido`; nunca somam ao faturamento).
- **Cobranças previstas** (competência futura, `faturada_em` vazio).
- **Cobranças canceladas** e **vendas canceladas** (aparecem em `v_cancelamentos`, separados).
- **Vendas só registradas** (ainda não faturadas).

## Distinções exigidas
| Conceito | Origem |
|---|---|
| Valor contratado | versão de valor vigente do contrato (`contrato_versoes`) |
| Previsto | cobranças ainda não faturadas (`faturada_em` nulo) |
| Faturado | cobranças faturadas e não canceladas |
| Recebido | soma de `pagamentos` |
| Pendente | faturado − recebido |
| Vencido | pendente de cobranças faturadas com vencimento < hoje |

## Status de cobrança
`prevista` (não faturada) · `pendente` · `parcialmente_paga` · `paga` · `vencida` (derivada) · `cancelada`. Uma cobrança parcialmente paga e vencida mostra "parcialmente paga" e a marca de vencida.

## Cobranças: regras de geração
- Idempotente: índice único `(contrato_id, competencia)` para cobranças de contrato; `(adicional_id, competencia)` para adicionais.
- Valor base = versão do contrato vigente na **data de vencimento** da competência; depois de gerada, **nunca é recalculada**.
- Dia de vencimento maior que o mês: vence no último dia do mês.
- Anual: só no mês de aniversário (ou mês configurado). Única: só no mês de início. Intervalo: a cada N meses desde o início.
- Competência até o mês corrente ⇒ faturada; futura ⇒ prevista (passa a faturada ao reprocessar quando a competência chegar).
- Adicional de contrato entra na cobrança aberta e sem pagamento; se não houver (contrato anual, cobrança já paga), gera cobrança própria (`tipo = 'adicional'`).
- Cobrança cancelada **não é recriada** pelo reprocessamento (mantém o cancelamento); adicionais já vinculados a ela não são re-faturados automaticamente.

## Limite
`acumulado` = soma de `v_receitas` do ano da empresa. `nivel`: `ok` < `atencao` ≤ % < `critico` ≤ % ≤ limite < `ultrapassado`. `sem_parametro` quando não há limite configurado — **nenhum limite é presumido**. Projeção = acumulado ÷ meses decorridos × 12, sempre rotulada **estimativa**. É ferramenta gerencial; não substitui apuração tributária oficial.

## Dúvidas fiscais
O sistema não classifica operações fiscalmente. Em caso de dúvida, registre a observação no lançamento; nenhuma regra fiscal é presumida.
