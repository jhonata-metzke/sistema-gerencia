# Modelo de dados

```
empresas ──< papeis_usuario >── auth.users          (owner = global; demais por empresa)
empresas ──< parametros_limite                       (por ano; limite, % de alerta, critério)
clientes (cadastro único, CNPJ único e normalizado)
sistemas · categorias_receita                        (apoio configurável)

contratos ──< contrato_versoes                       (valor com vigência)
contratos ──< adicionais (opcional) ──< cobranca_adicionais >── cobrancas
contratos ──< cobrancas ──< pagamentos               (valores congelados na geração)
vendas ──< venda_itens · venda_ajustes               (devolução/estorno)
auditoria                                            (triggers em todas as tabelas de negócio)
```

- **Cliente único; vínculo por empresa no contrato/cobrança/venda.** Nada de duplicar cliente nem misturar receita.
- **Empresas novas**: basta inserir em `empresas`; nada é fixo em 3 CNPJs.
- **CNPJ** numérico ou alfanumérico (formato vigente a partir de 07/2026), validado por dígito verificador no banco e na interface.
- **Dinheiro**: `numeric(14,2)`; quantidade `numeric(14,3)`; total do item é coluna gerada (`round(qtd × unit, 2) − desconto`).
- **Histórico**: `auditoria` (antes/depois em JSON) por trigger; `contrato_versoes` guarda o histórico de valores.
- **Migrations** em `supabase/migrations`, ordenadas por data; nenhuma contém dados de negócio.
