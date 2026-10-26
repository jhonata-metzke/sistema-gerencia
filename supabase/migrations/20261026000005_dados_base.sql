-- Dados de apoio do sistema (não são dados do negócio). Nenhuma empresa, cliente ou valor é inserido.
insert into public.categorias_receita (nome, tipo_base) values
  ('Mensalidades', 'mensalidade'),
  ('Adicionais', 'adicional'),
  ('Vendas de mercadorias', 'venda')
on conflict (nome) do nothing;
