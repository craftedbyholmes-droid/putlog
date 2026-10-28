-- Row-level security on every table. A firm sees only its own rows (rule 10).
-- Owner and office see everything in their firm; gang users see only operations they are crewed on,
-- with no prices. Helper functions live in the non-exposed "private" schema.

create or replace function private.my_company() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function private.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function private.is_office() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(private.my_role() in ('owner','office'), false);
$$;

create or replace function private.is_crewed_on(p_operation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.operation_crew oc
                   join public.staff s on s.id = oc.staff_id
                  where oc.operation_id = p_operation and s.profile_id = auth.uid());
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;
revoke all on all tables in schema public from anon;

-- companies
alter table public.companies enable row level security;
create policy companies_read on public.companies for select to authenticated
  using (id = private.my_company());
create policy companies_owner_update on public.companies for update to authenticated
  using (id = private.my_company() and private.my_role() = 'owner')
  with check (id = private.my_company());

-- profiles
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or (company_id = private.my_company() and private.is_office()));
create policy profiles_owner_write on public.profiles for all to authenticated
  using (company_id = private.my_company() and private.my_role() = 'owner')
  with check (company_id = private.my_company() and private.my_role() = 'owner');

-- every plain tenant table: owner/office full access inside their own firm
do $$
declare t text;
begin
  foreach t in array array[
    'clients','staff','vans','staff_absences','saved_gangs','rate_cards',
    'jobs','sites','scaffolds','job_elevations','quotes','quote_lines','haki_calculations',
    'compliance_docs','compliance_sheets','bespoke_designs','handovers','inspections',
    'inspection_items','inspection_defects']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for all to authenticated
                     using (company_id = private.my_company() and private.is_office())
                     with check (company_id = private.my_company() and private.is_office())$p$,
                   t || '_office', t);
  end loop;
end $$;

-- operations: office full access; gang can read operations they are crewed on
alter table public.operations enable row level security;
create policy operations_office on public.operations for all to authenticated
  using (company_id = private.my_company() and private.is_office())
  with check (company_id = private.my_company() and private.is_office());
create policy operations_gang_read on public.operations for select to authenticated
  using (company_id = private.my_company() and private.is_crewed_on(id));

alter table public.operation_crew enable row level security;
create policy crew_office on public.operation_crew for all to authenticated
  using (company_id = private.my_company() and private.is_office())
  with check (company_id = private.my_company() and private.is_office());
create policy crew_gang_read on public.operation_crew for select to authenticated
  using (company_id = private.my_company() and private.is_crewed_on(operation_id));

-- templates: firms see their own plus the shipped defaults; defaults are never writable
alter table public.document_templates enable row level security;
create policy templates_read on public.document_templates for select to authenticated
  using (company_id is null or (company_id = private.my_company() and private.is_office()));
create policy templates_write on public.document_templates for insert to authenticated
  with check (company_id = private.my_company() and private.is_office() and source = 'uploaded');
create policy templates_update on public.document_templates for update to authenticated
  using (company_id = private.my_company() and private.is_office())
  with check (company_id = private.my_company() and source = 'uploaded');
create policy templates_delete on public.document_templates for delete to authenticated
  using (company_id = private.my_company() and private.is_office());

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.search_clients(text) to authenticated;

-- private storage buckets, path-scoped by company: <company_id>/...  (skipped where storage is absent)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values
      ('logos','logos',false),('documents','documents',false),
      ('templates','templates',false),('signatures','signatures',false)
    on conflict (id) do nothing;
    execute $p$create policy firm_files_read on storage.objects for select to authenticated
      using (bucket_id in ('logos','documents','templates')
             and (storage.foldername(name))[1] = private.my_company()::text)$p$;
    execute $p$create policy firm_files_write on storage.objects for insert to authenticated
      with check (bucket_id in ('logos','documents','templates')
                  and (storage.foldername(name))[1] = private.my_company()::text
                  and private.is_office())$p$;
    -- signatures: no client-side access at all; rendered server-side with the service role
  end if;
end $$;
