export type Papel = 'owner' | 'gestor' | 'operador' | 'leitor'
export type Periodicidade = 'mensal' | 'anual' | 'unica' | 'intervalo'

export interface Empresa {
  id: string; razao_social: string; nome_fantasia: string | null; cnpj: string
  regime_tributario: string; inicio_atividades: string | null; situacao: 'ativa' | 'inativa'
}
export interface Cliente {
  id: string; razao_social: string; cnpj: string; nome_fantasia: string | null
  inscricao_estadual: string | null; telefone: string | null; email: string | null
  endereco: string | null; observacoes: string | null; ativo: boolean
}
export interface Sistema { id: string; nome: string; ativo: boolean }
export interface Categoria { id: string; nome: string; tipo_base: 'mensalidade' | 'adicional' | 'venda'; ativo: boolean }

export interface ContratoLista {
  id: string; empresa_id: string; cliente_id: string; sistema_id: string | null; categoria_id: string | null
  descricao: string; periodicidade: Periodicidade; intervalo_meses: number | null; dia_vencimento: number
  mes_cobranca_anual: number | null; emite_nf: boolean; inicio_em: string; fim_em: string | null
  situacao: 'ativo' | 'suspenso' | 'encerrado'; observacoes: string | null
  cliente_razao_social: string; cliente_cnpj: string; valor_atual: number | null
  sistema_nome: string | null; empresa_nome: string | null; empresa_razao_social: string
}
export interface ContratoVersao { id: string; contrato_id: string; valor_base: number; vigencia_inicio: string; motivo: string | null; created_at: string }

export interface Adicional {
  id: string; empresa_id: string; cliente_id: string; contrato_id: string | null; categoria_id: string | null
  descricao: string; valor: number; data: string; competencia: string; periodicidade: Periodicidade
  intervalo_meses: number | null; fim_em: string | null; situacao: 'ativo' | 'encerrado' | 'cancelado'
  emite_nf: boolean; observacoes: string | null
}

export type StatusExibicao = 'prevista' | 'pendente' | 'parcialmente_paga' | 'paga' | 'vencida' | 'cancelada'
export interface CobrancaView {
  id: string; empresa_id: string; cliente_id: string; contrato_id: string | null; tipo: 'contrato' | 'adicional'
  competencia: string; vencimento: string; valor_base: number; valor_adicionais: number; valor_total: number
  faturada_em: string | null; status: string; observacoes: string | null
  cliente_razao_social: string; cliente_cnpj: string; valor_pago: number; valor_pendente: number
  vencida: boolean; status_exibicao: StatusExibicao
}
export interface Pagamento { id: string; cobranca_id: string; data_recebimento: string; valor: number; forma: string | null; observacao: string | null }

export interface Venda {
  id: string; empresa_id: string; cliente_id: string | null; comprador_nome: string | null; comprador_documento: string | null
  categoria_id: string | null; data_operacao: string; documento: string | null
  status: 'registrada' | 'faturada' | 'recebida' | 'cancelada'; observacoes: string | null
}
export interface VendaItem { id: string; venda_id: string; descricao: string; quantidade: number; valor_unitario: number; desconto: number; total: number }
export interface VendaAjuste { id: string; venda_id: string; tipo: 'devolucao' | 'estorno'; valor: number; data: string; motivo: string | null }

export interface Receita {
  chave: string; empresa_id: string; cliente_id: string | null; tipo: 'mensalidade' | 'adicional' | 'venda'
  categoria_id: string | null; competencia: string; data_ref: string; valor: number
  origem: string; origem_id: string; descricao: string | null
}
export interface FaturamentoMensal {
  empresa_id: string; ano: number; mes: number; tipo: Receita['tipo']; categoria_id: string | null; valor: number; registros: number
}
export interface Cancelamento { chave: string; empresa_id: string; cliente_id: string | null; tipo: string; competencia: string; valor: number; motivo: string | null }

export interface ParametroLimite {
  id: string; empresa_id: string; ano: number; regime: string | null; limite: number
  alerta_atencao: number; alerta_critico: number; criterio: string | null; observacoes: string | null; faturamento_anterior: number
}
export interface LimiteSituacao {
  empresa_id: string; ano: number; regime: string | null; limite: number | null; alerta_atencao: number | null
  alerta_critico: number | null; acumulado: number; saldo: number | null; percentual: number | null
  nivel: 'sem_parametro' | 'ok' | 'atencao' | 'critico' | 'ultrapassado'; projecao_anual: number
}
export interface IndicadoresCobranca {
  empresa_id: string; qtd: number; previsto: number; faturado: number; recebido: number
  pendente: number; vencido: number; qtd_vencidas: number
}
export interface ResumoContratos { empresa_id: string; contratos_ativos: number; mensalidades_contratadas: number; outros_contratos_valor: number }
export interface Auditoria { id: number; tabela: string; registro_id: string | null; acao: string; usuario: string | null; em: string; antes: unknown; depois: unknown }
