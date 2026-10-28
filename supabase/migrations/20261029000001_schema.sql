-- Putlog — first test build schema
-- Hierarchy: Job -> Site -> Scaffold -> Operation. Every tenant row carries company_id,
-- and child rows reference (company_id, parent_id) so a row can never point across firms.

create extension if not exists pg_trgm;
create schema if not exists private;

-- ---------- enums ----------
create type public.user_role        as enum ('owner','office','gang');
create type public.workflow_mode    as enum ('full','simplified');
create type public.job_status       as enum ('enquiry','quoted','accepted','invoiced','paid','closed');
create type public.scaffold_status  as enum ('planned','rams_raised','erecting','on_hire','dismantle_requested','dismantling','dismantled');
create type public.scaffold_kind    as enum ('tube_fitting','haki_stair_tower');
create type public.pricing_mode     as enum ('squareage','meterage','height','component');
create type public.hire_trigger     as enum ('job_up_confirmed','handover_emailed');
create type public.hire_offset      as enum ('same_day','next_day');
create type public.operation_type   as enum ('put_up','adapt','strike','repair','inspection');
create type public.worker_type      as enum ('employee','subcontractor');
create type public.cis_status       as enum ('registered','unregistered','gross');
create type public.rate_type        as enum ('day','hourly','squareage','run_meterage','height');
create type public.absence_type     as enum ('holiday','sick');
create type public.doc_type         as enum ('rams','tg20_21','tg30','bespoke_design','inspection','handover');
create type public.template_kind    as enum ('method_statement','risk_assessment','handover','inspection','quote','other');
create type public.template_source  as enum ('default','uploaded');
create type public.inspecting_party as enum ('us','customer','third_party');
create type public.acceptance_method as enum ('digital_signature','manual_override');
create type public.signature_status as enum ('pending','resolved');
create type public.check_result     as enum ('yes','no','n/a');
create type public.haki_orientation as enum ('width_against','length_against');

-- ---------- tenants and people ----------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text, phone text, email text,
  logo_path text,                                  -- private storage path, PNG, padded to the template frame
  vat_registered boolean not null default false,
  vat_number text,
  default_first_lift_m numeric(4,2) not null default 2.0 check (default_first_lift_m > 0),
  step_limit_mm int not null default 200 check (step_limit_mm between 0 and 220),
  labour_on_cost_pct numeric(5,2) not null default 0,
  working_days_a text default 'Mon–Thu', working_hours_a text default '0800–1600',
  working_days_b text default 'Fri',     working_hours_b text default '0800–1530',
  counters jsonb not null default '{}',            -- per-firm numbering: job, quote, certificate, report
  created_at timestamptz not null default now(),
  constraint vat_number_when_registered check (not vat_registered or vat_number is not null)
);

-- one row per login (auth.users). One account per person, never shared.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  position text,
  phone text,
  role public.user_role not null,
  is_competent_inspector boolean not null default false,
  inspector_qualification text,
  inspector_qualification_expiry date,
  signature_path text,
  unique (company_id, id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,                -- contact name
  company_name text,
  address text, postcode text, email text, phone text,
  workflow_mode public.workflow_mode not null default 'full',
  default_hire_start_trigger public.hire_trigger not null default 'job_up_confirmed',
  default_hire_start_offset  public.hire_offset  not null default 'same_day',
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create index clients_search_trgm on public.clients
  using gin ((coalesce(name,'')||' '||coalesce(company_name,'')||' '||coalesce(postcode,'')) gin_trgm_ops);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid,                   -- null for a named subbie with no login
  name text not null,
  phone text,
  position text,
  worker_type public.worker_type not null,
  cis_status public.cis_status,
  cisrs_card_expiry date,
  day_rate numeric(10,2), hourly_rate numeric(10,2), squareage_rate numeric(10,2),
  run_meterage_rate numeric(10,2), height_rate numeric(10,2),
  active boolean not null default true,
  unique (company_id, id),
  foreign key (company_id, profile_id) references public.profiles(company_id, id),
  constraint cis_only_for_subbies check (worker_type = 'subcontractor' or cis_status is null)
);

create table public.vans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  registration text not null,
  name text,
  unique (company_id, id)
);

create table public.staff_absences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  staff_id uuid not null,
  day date not null,
  kind public.absence_type not null,
  unique (staff_id, day),
  foreign key (company_id, staff_id) references public.staff(company_id, id) on delete cascade
);

create table public.saved_gangs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  member_ids uuid[] not null default '{}'
);

create table public.rate_cards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  unit public.pricing_mode not null,
  scaffold_kind public.scaffold_kind not null,
  price numeric(10,2) not null check (price >= 0),
  unique (company_id, unit, scaffold_kind)
);

-- ---------- the hierarchy ----------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  client_id uuid not null,                                     -- rule 13
  reference text not null,                                     -- set per firm by trigger: JOB0001
  status public.job_status not null default 'enquiry',
  pricing_mode public.pricing_mode not null default 'squareage',  -- default only; each scaffold prices itself
  hire_start_trigger public.hire_trigger not null default 'job_up_confirmed',
  hire_start_offset  public.hire_offset  not null default 'same_day',
  scope text,
  supervisor_staff_id uuid,
  emergency_contact_name text,
  emergency_contact_phone text,
  quote_valid_days int not null default 30,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, reference),
  foreign key (company_id, supervisor_staff_id) references public.staff(company_id, id),
  foreign key (company_id, client_id) references public.clients(company_id, id) on delete restrict
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  job_id uuid not null,
  address text not null,
  postcode text,
  unique (company_id, id),
  foreign key (company_id, job_id) references public.jobs(company_id, id) on delete cascade
);

create table public.scaffolds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  site_id uuid not null,
  name text not null,                                -- work area, e.g. "Front elevation"
  kind public.scaffold_kind not null default 'tube_fitting',
  pricing_mode public.pricing_mode not null,            -- HAKI and tube-and-fitting priced separately
  status public.scaffold_status not null default 'planned',
  hire_included_weeks int not null default 4 check (hire_included_weeks > 0),
  first_lift_m numeric(4,2) not null check (first_lift_m > 0),   -- the only lift toggle
  lift_m numeric(4,2) not null default 2.0 check (lift_m > 0),
  target_height_m numeric(5,2),
  item_no int not null default 1,
  planned_start_date date,      -- goes on the RAMS before the put-up can be scheduled (rule 2)
  planned_days int,
  erected_at timestamptz,
  unique (company_id, id),
  foreign key (company_id, site_id) references public.sites(company_id, id) on delete restrict
);

create table public.operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  scaffold_id uuid not null,
  type public.operation_type not null,
  start_date date,                -- null = unscheduled
  end_date date,
  van_id uuid,
  unique (company_id, id),
  foreign key (company_id, scaffold_id) references public.scaffolds(company_id, id) on delete restrict,
  foreign key (company_id, van_id) references public.vans(company_id, id),
  constraint dates_in_order check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.operation_crew (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  operation_id uuid not null,
  day date not null,
  staff_id uuid not null,
  hours numeric(5,2),
  rate_type public.rate_type not null default 'day',
  unique (operation_id, day, staff_id),
  foreign key (company_id, operation_id) references public.operations(company_id, id) on delete cascade,
  foreign key (company_id, staff_id) references public.staff(company_id, id)
);

-- ---------- quoting ----------
create table public.job_elevations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  scaffold_id uuid not null,
  label text,
  quoted_length_m numeric(8,2), quoted_height_m numeric(8,2),
  quoted_area_m2 numeric(10,2) generated always as (round(quoted_length_m * quoted_height_m, 2)) stored,
  asbuilt_length_m numeric(8,2), asbuilt_height_m numeric(8,2),
  asbuilt_area_m2 numeric(10,2) generated always as (round(asbuilt_length_m * asbuilt_height_m, 2)) stored,
  foreign key (company_id, scaffold_id) references public.scaffolds(company_id, id) on delete cascade
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  job_id uuid not null,
  number text not null,                                        -- set per firm by trigger: Q0001
  issued_at timestamptz,
  vat_registered boolean,          -- snapshot of the firm profile at issue
  vat_number text,
  vat_rate numeric(5,2),           -- placeholder standard rate until an accountant confirms treatment
  unique (company_id, id),
  foreign key (company_id, job_id) references public.jobs(company_id, id) on delete cascade
);

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  quote_id uuid not null,
  scaffold_id uuid,
  description text not null,
  pricing_mode public.pricing_mode not null,
  quantity numeric(10,2) not null,
  unit text not null,
  unit_price numeric(10,2) not null,
  line_total numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  foreign key (company_id, quote_id) references public.quotes(company_id, id) on delete cascade,
  foreign key (company_id, scaffold_id) references public.scaffolds(company_id, id)
);

create table public.haki_calculations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  scaffold_id uuid not null,
  target_height_m numeric(5,2) not null,
  lift_height_m numeric(3,1) not null check (lift_height_m in (1.0, 1.5, 2.0)),
  orientation public.haki_orientation not null,
  pricing_mode public.pricing_mode not null check (pricing_mode in ('height','component')),
  bill_of_materials jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (company_id, scaffold_id) references public.scaffolds(company_id, id) on delete cascade
);

-- ---------- compliance documents ----------
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,   -- null = shipped default
  kind public.template_kind not null,
  name text not null,
  source public.template_source not null,
  file_path text not null,
  version int not null default 1,
  active boolean not null default false,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  constraint default_has_no_company check ((source = 'default') = (company_id is null))
);

create table public.compliance_docs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  scaffold_id uuid not null,
  type public.doc_type not null,
  reference text,
  docx_path text, pdf_path text,
  files jsonb not null default '{}',         -- every generated file: {"method_statement": {"docx": .., "pdf": ..}, ...}
  missing_fields text[] not null default '{}',
  photos text[] not null default '{}',
  template_id uuid references public.document_templates(id),
  template_version int,
  revision_no int not null default 0,
  issued_at timestamptz,
  issued_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, scaffold_id) references public.scaffolds(company_id, id) on delete restrict
);

create table public.compliance_sheets (            -- TG20:21 / TG30, recorded from the NASC sheet, never generated
  doc_id uuid primary key,
  company_id uuid not null,
  sheet_reference text not null,
  scaffold_type text, wind_factor numeric, max_height_m numeric, max_boarded_lifts int,
  max_lift_height_m numeric, max_bay_length_m numeric, max_boards_wide int,
  max_loading_kn_m2 numeric, tie_duty text, tie_load_kn numeric, max_leg_load_kn numeric,
  load_class text, cladding_permitted boolean, add_ons_permitted text, restrictions_text text,
  prepared_by jsonb, checked_by jsonb,
  foreign key (company_id, doc_id) references public.compliance_docs(company_id, id) on delete cascade
);

create table public.bespoke_designs (
  doc_id uuid primary key,
  company_id uuid not null,
  designer_name text not null, designer_position text, designer_company text,
  drawing_ref text not null, covers text, designed_at date,
  foreign key (company_id, doc_id) references public.compliance_docs(company_id, id) on delete cascade
);

create table public.handovers (
  doc_id uuid primary key,
  company_id uuid not null,
  certificate_ref text not null,
  loading_class text, permitted_use text, max_loaded_platforms text, restrictions text,
  max_leg_load_kn numeric, add_ons_permitted text,
  inspecting_party public.inspecting_party,
  inspection_responsible_name text, inspection_responsible_phone text,
  next_inspection_due date,
  acceptance_method public.acceptance_method,
  signature_status public.signature_status not null default 'pending',
  confirmed_by_name text, confirmed_by_role text, confirmed_by_company text, confirmed_at timestamptz,
  signed_ip inet,
  sent_at timestamptz,
  overridden_by_user_id uuid, override_evidence_url text, override_channel text check (override_channel in ('email','sms')),
  foreign key (company_id, doc_id) references public.compliance_docs(company_id, id) on delete cascade
);

create table public.inspections (
  doc_id uuid primary key,
  company_id uuid not null,
  report_ref text not null,
  inspection_type text not null,
  inspected_at timestamptz not null,
  weather text, outcome text, tag_updated boolean,
  next_inspection_due date, copies_sent_to text,
  inspector_profile_id uuid,
  device_signed_at timestamptz, server_received_at timestamptz,
  foreign key (company_id, doc_id) references public.compliance_docs(company_id, id) on delete cascade
);

create table public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  inspection_id uuid not null references public.inspections(doc_id) on delete cascade,
  position int not null,
  item text not null, result public.check_result, comment text
);

create table public.inspection_defects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  inspection_id uuid not null references public.inspections(doc_id) on delete cascade,
  matter text not null, action_taken text, further_action text, responsible text, due_date date
);

-- ---------- rule 2: no erection without paperwork ----------
create or replace function private.scaffold_paperwork_ok(p_scaffold uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.compliance_docs d
                  where d.scaffold_id = p_scaffold and d.type = 'rams' and d.issued_at is not null)
     and exists (select 1 from public.compliance_docs d
                  where d.scaffold_id = p_scaffold and d.type in ('tg20_21','tg30','bespoke_design'));
$$;

create or replace function private.enforce_scaffold_gate() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status in ('erecting','on_hire','dismantle_requested','dismantling','dismantled')
     and (tg_op = 'INSERT' or old.status in ('planned','rams_raised'))
     and not private.scaffold_paperwork_ok(new.id) then
    raise exception 'RULE 2: scaffold % has no issued RAMS and compliance sheet or bespoke design', new.id
      using errcode = 'check_violation';
  end if;
  if new.status = 'rams_raised' and tg_op = 'UPDATE' and old.status = 'planned'
     and not exists (select 1 from public.compliance_docs where scaffold_id = new.id and type = 'rams') then
    raise exception 'scaffold % has no RAMS pack yet', new.id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger scaffold_gate before insert or update of status on public.scaffolds
  for each row execute function private.enforce_scaffold_gate();

create or replace function private.enforce_operation_gate() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.type = 'put_up' and new.start_date is not null and not private.scaffold_paperwork_ok(new.scaffold_id) then
    raise exception 'RULE 2: put-up cannot be scheduled before RAMS is issued and a sheet or bespoke design exists'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger operation_gate before insert or update of start_date, type on public.operations
  for each row execute function private.enforce_operation_gate();

-- ---------- client search (rule 13) ----------
create or replace function public.search_clients(q text) returns setof public.clients
language sql stable as $$
  select * from public.clients
   where (coalesce(name,'')||' '||coalesce(company_name,'')||' '||coalesce(postcode,'')) ilike '%' || q || '%'
      or replace(coalesce(postcode,''),' ','') ilike '%' || replace(q,' ','') || '%'
   order by company_name nulls last, name
   limit 20;
$$;

-- ---------- the shipped default templates (read-only to every firm) ----------
insert into public.document_templates (company_id, kind, name, source, file_path, version, active) values
  (null,'method_statement','Standard method statement','default','standard/Method_Statement_TEMPLATE.docx',1,true),
  (null,'risk_assessment','Standard risk assessment','default','standard/Risk_Assessment_TEMPLATE.docx',1,true),
  (null,'handover','Standard handover certificate','default','standard/Handover_Certificate_TEMPLATE.docx',1,true),
  (null,'inspection','Standard inspection report','default','standard/Inspection_Report_TEMPLATE.docx',1,true),
  (null,'quote','Standard quotation','default','standard/Quote_TEMPLATE.docx',1,true);

-- ---------- per-firm numbering ----------
create or replace function private.next_number(p_company uuid, p_kind text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and p_company is distinct from (select company_id from public.profiles where id = auth.uid()) then
    raise exception 'numbering is per firm' using errcode = 'insufficient_privilege';
  end if;
  update public.companies
     set counters = jsonb_set(counters, array[p_kind], to_jsonb(coalesce((counters->>p_kind)::int, 0) + 1))
   where id = p_company
  returning (counters->>p_kind)::int into n;
  return n;
end $$;

create or replace function private.number_job() returns trigger language plpgsql as $$
begin
  if new.reference is null then new.reference := 'JOB' || lpad(private.next_number(new.company_id,'job')::text, 4, '0'); end if;
  return new;
end $$;
create trigger job_number before insert on public.jobs for each row execute function private.number_job();

create or replace function private.number_quote() returns trigger language plpgsql as $$
begin
  if new.number is null then new.number := 'Q' || lpad(private.next_number(new.company_id,'quote')::text, 4, '0'); end if;
  return new;
end $$;
create trigger quote_number before insert on public.quotes for each row execute function private.number_quote();

-- ---------- rule 7: an issued document never changes; corrections are a new revision ----------
create or replace function private.issued_docs_immutable() returns trigger language plpgsql as $$
begin
  if old.issued_at is not null and (new.issued_at is distinct from old.issued_at
       or new.docx_path is distinct from old.docx_path or new.pdf_path is distinct from old.pdf_path
       or new.files is distinct from old.files
       or new.template_id is distinct from old.template_id or new.revision_no is distinct from old.revision_no) then
    raise exception 'Issued documents cannot be changed. Create a new revision instead.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger issued_docs_immutable before update on public.compliance_docs
  for each row execute function private.issued_docs_immutable();
