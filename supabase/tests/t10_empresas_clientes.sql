do $$ begin
  perform t_login('owner');
  perform t_eq('1 Três empresas cadastradas e visíveis ao proprietário', (select count(*) from empresas), 3::bigint);
  perform t_raises('1 CNPJ de empresa duplicado é rejeitado',
    $q$insert into empresas(razao_social, cnpj) values ('X', '11.222.333/0001-81')$q$);
  perform t_raises('1 CNPJ de empresa com dígito inválido é rejeitado',
    $q$insert into empresas(razao_social, cnpj) values ('X', '11222333000182')$q$);
  perform t_ok('1 CNPJ alfanumérico válido foi aceito e normalizado',
    exists (select 1 from empresas where cnpj = '12ABC345000188'));
  perform t_ok('1 Empresas têm regimes próprios (não assumidos iguais)',
    (select count(distinct regime_tributario) from empresas) = 2);

  perform t_eq('4 Cliente cadastrado uma única vez (3 clientes)', (select count(*) from clientes), 3::bigint);
  perform t_raises('4 CNPJ de cliente duplicado com outra formatação é rejeitado',
    $q$insert into clientes(razao_social, cnpj) values ('Dup', '12.345.678/0001-95')$q$);
  perform t_raises('4 CNPJ de cliente inválido é rejeitado',
    $q$insert into clientes(razao_social, cnpj) values ('Inv', '11111111111111')$q$);
  perform t_logout();
end $$;
