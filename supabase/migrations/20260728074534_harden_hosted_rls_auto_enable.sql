do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute
      'revoke execute on function public.rls_auto_enable()
       from public, anon, authenticated, service_role';
  end if;
end;
$$;
