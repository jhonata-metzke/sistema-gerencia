-- Criação atômica de venda com itens.
create function public.criar_venda(p_dados jsonb, p_itens jsonb) returns uuid
language plpgsql as $$
declare r public.vendas; v_id uuid; i jsonb;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa de ao menos um item.';
  end if;
  r := jsonb_populate_record(null::public.vendas, p_dados);
  insert into public.vendas (empresa_id, cliente_id, comprador_nome, comprador_documento, categoria_id, data_operacao, documento, status, observacoes)
  values (r.empresa_id, r.cliente_id, r.comprador_nome, r.comprador_documento, r.categoria_id,
          coalesce(r.data_operacao, current_date), r.documento, coalesce(r.status, 'registrada'), r.observacoes)
  returning id into v_id;
  for i in select * from jsonb_array_elements(p_itens) loop
    insert into public.venda_itens (venda_id, descricao, quantidade, valor_unitario, desconto)
    values (v_id, i->>'descricao', (i->>'quantidade')::numeric, (i->>'valor_unitario')::numeric, coalesce((i->>'desconto')::numeric, 0));
  end loop;
  return v_id;
end $$;
