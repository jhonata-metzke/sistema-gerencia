// Definição documentada de cada indicador (espelha docs/criterios-faturamento.md).
export const DEFINICOES = {
  faturamentoMes:
    'Soma das receitas elegíveis com competência no mês: valor base e adicionais de cobranças faturadas e não canceladas, mais vendas faturadas/recebidas, menos devoluções e estornos. Pagamentos não entram.',
  faturamentoAno:
    'Mesma regra do faturamento do mês, acumulada de janeiro até o mês selecionado do ano.',
  mensalidadesContratadas:
    'Soma do valor vigente hoje dos contratos ativos com periodicidade mensal. Contratos anuais, únicos e por intervalo ficam em "Outros contratos".',
  previsto:
    'Cobranças geradas para competências futuras ainda não faturadas. Não são faturamento realizado.',
  faturado:
    'Valor total das cobranças com competência no período que já foram faturadas e não foram canceladas.',
  recebido:
    'Soma dos pagamentos registrados nas cobranças do período. É um indicador de caixa e nunca é somado ao faturamento.',
  pendente:
    'Faturado menos recebido nas cobranças do período (cobranças canceladas não contam).',
  vencido:
    'Parte pendente de cobranças faturadas, não canceladas e não quitadas, com vencimento anterior a hoje.',
  mensalidades: 'Faturamento do valor base das cobranças de contratos (mensalidades, anuidades, etc.).',
  adicionais: 'Faturamento dos adicionais vinculados a cobranças faturadas e não canceladas.',
  vendas:
    'Faturamento de vendas faturadas ou recebidas, líquido de devoluções e estornos (lançados no mês do ajuste). Vendas apenas registradas e canceladas ficam de fora.',
  limite:
    'Faturamento acumulado do ano (mesma regra acima) dividido pelo limite que você configurou para a empresa. É gerencial e não substitui a apuração oficial.',
  projecao:
    'ESTIMATIVA: acumulado dividido pelos meses decorridos, multiplicado por 12. Não considera sazonalidade nem contratos futuros.',
} as const
