-- Demo data for the test build. Fake firms, people and Norfolk addresses only. Runs on `supabase db reset`.
-- Logins (local only):  owner@putlog.test / putlog-demo   office@putlog.test / putlog-demo
--                       other@putlog.test / putlog-demo   (a second firm, to show it can't see the first)

do $$
declare
  firm uuid := '11111111-1111-1111-1111-111111111111';
  rival uuid := '22222222-2222-2222-2222-222222222222';
  u_owner uuid := 'a0000000-0000-0000-0000-000000000001';
  u_office uuid := 'a0000000-0000-0000-0000-000000000002';
  u_gang uuid := 'a0000000-0000-0000-0000-000000000003';
  u_other uuid := 'a0000000-0000-0000-0000-000000000009';
  wk date := date_trunc('week', current_date)::date;   -- this Monday
  s_dan uuid; s_lee uuid; s_tom uuid; s_jay uuid; s_sam uuid; s_mick uuid;
  v1 uuid; v2 uuid; v3 uuid;
  c record; j uuid; si uuid; sc uuid; op uuid; d uuid; q uuid;
  u record;
begin
  -- logins
  for u in select * from (values (u_owner,'owner@putlog.test'),(u_office,'office@putlog.test'),(u_gang,'chargehand@putlog.test'),(u_other,'other@putlog.test')) t(id,email) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
            extensions.crypt('putlog-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now());
  end loop;

  insert into companies (id, name, address, phone, email, vat_registered, vat_number) values
    (firm, 'Broadland Scaffolding Ltd (demo)', 'Unit 7, Folgate Road, North Walsham NR28 0AJ', '01692 555 010', 'office@broadland-demo.invalid', true, 'GB000000000'),
    (rival, 'Other Firm Ltd (demo)', '1 Elsewhere Lane, Norwich NR1 1AA', '01603 555 999', 'office@other-demo.invalid', false, null);
  insert into profiles (id, company_id, full_name, position, role, is_competent_inspector, inspector_qualification) values
    (u_owner, firm, 'Keith (demo owner)', 'Owner', 'owner', true, 'CISRS Advanced Scaffolder'),
    (u_office, firm, 'Sarah Office', 'Office manager', 'office', false, null),
    (u_gang, firm, 'Dan Price', 'Charge hand', 'gang', true, 'CISRS Advanced Scaffolder'),
    (u_other, rival, 'Other Owner', 'Owner', 'owner', false, null);

  insert into staff (company_id, profile_id, name, phone, position, worker_type, cisrs_card_expiry, day_rate) values (firm, u_gang, 'Dan Price', '07700 900001', 'Charge hand', 'employee', wk + 400, 180) returning id into s_dan;
  insert into staff (company_id, name, phone, worker_type, cisrs_card_expiry, day_rate) values (firm, 'Lee Barker', '07700 900002', 'employee', wk + 300, 150) returning id into s_lee;
  insert into staff (company_id, name, phone, worker_type, cisrs_card_expiry, day_rate) values (firm, 'Tom Riches', '07700 900003', 'employee', wk + 12, 140) returning id into s_tom;
  insert into staff (company_id, name, phone, worker_type, cisrs_card_expiry, day_rate) values (firm, 'Jay Moss', '07700 900004', 'employee', wk + 500, 120) returning id into s_jay;
  insert into staff (company_id, name, phone, worker_type, cis_status, cisrs_card_expiry, day_rate) values (firm, 'Sam Ellis (subbie)', '07700 900005', 'subcontractor', 'registered', wk + 200, 200) returning id into s_sam;
  insert into staff (company_id, name, phone, worker_type, cis_status, cisrs_card_expiry, day_rate) values (firm, 'Mick Hunt (subbie)', '07700 900006', 'subcontractor', 'unregistered', wk - 5, 190) returning id into s_mick;
  insert into vans (company_id, registration, name) values (firm, 'NR21 SCF', 'Flatbed 1') returning id into v1;
  insert into vans (company_id, registration, name) values (firm, 'NR19 TUB', 'Flatbed 2') returning id into v2;
  insert into vans (company_id, registration, name) values (firm, 'AY70 HAK', 'Tipper') returning id into v3;
  insert into rate_cards (company_id, unit, scaffold_kind, price) values (firm, 'squareage', 'tube_fitting', 3.50), (firm, 'meterage', 'tube_fitting', 18.00), (firm, 'height', 'haki_stair_tower', 45.00);
  insert into staff_absences (company_id, staff_id, day, kind) values (firm, s_jay, wk + 3, 'holiday');

  -- clients
  insert into clients (company_id, name, company_name, address, postcode, email, phone) values
    (firm, 'Jo Bloggs', 'Acme Builders', '2 Market Place, Aylsham', 'NR11 6EH', 'jo@acme-demo.invalid', '01263 555 001'),
    (firm, 'Priya Shah', 'Coastline Homes', '18 Garden Street, Cromer', 'NR27 9HN', 'priya@coastline-demo.invalid', '01263 555 002'),
    (firm, 'Mark Ellis', 'Wherry Roofing', '5 Staithe Road, Wroxham', 'NR12 8DL', 'mark@wherry-demo.invalid', '01603 555 003'),
    (firm, 'Helen Ward', null, '41 Grammar School Road, North Walsham', 'NR28 9JH', 'helen@example.invalid', '07700 900100'),
    (firm, 'Gareth Lowe', 'Broads Housing Association', 'Riverside House, Norwich', 'NR1 1SR', 'gareth@bha-demo.invalid', '01603 555 005'),
    (firm, 'Ruth King', 'King & Sons Builders', '9 Bridge Street, Fakenham', 'NR21 9AZ', 'ruth@king-demo.invalid', '01328 555 006');
  insert into clients (company_id, name, company_name, postcode) values (rival, 'Rival Client', 'Rival Developments', 'NR1 2AB');

  -- helper: a job with one site
  -- 1. Enquiry
  insert into jobs (company_id, client_id, scope) select firm, id, 'Chimney scaffold, rear' from clients where company_name = 'Wherry Roofing' returning id into j;
  insert into sites (company_id, job_id, address, postcode) values (firm, j, '5 Staithe Road, Wroxham', 'NR12 8DL');
  -- 2. Quoted
  insert into jobs (company_id, client_id, scope, status) select firm, id, 'Full front for re-render', 'quoted' from clients where name = 'Helen Ward' returning id into j;
  insert into sites (company_id, job_id, address, postcode) values (firm, j, '41 Grammar School Road, North Walsham', 'NR28 9JH') returning id into si;
  insert into scaffolds (company_id, site_id, name, pricing_mode, first_lift_m, planned_start_date, planned_days) values (firm, si, 'Front elevation', 'squareage', 2.0, wk + 14, 1) returning id into sc;
  insert into job_elevations (company_id, scaffold_id, label, quoted_length_m, quoted_height_m) values (firm, sc, 'A', 10, 6), (firm, sc, 'B', 8, 6);
  insert into quotes (company_id, job_id, issued_at, vat_registered, vat_number, vat_rate) values (firm, j, now() - interval '3 days', true, 'GB000000000', 20) returning id into q;
  insert into quote_lines (company_id, quote_id, scaffold_id, description, pricing_mode, quantity, unit, unit_price) values (firm, q, sc, 'Front elevation: scaffold area', 'squareage', 108, 'm²', 3.50);
  -- 3. Accepted: planned, no RAMS yet (shows the rule 2 gate)
  insert into jobs (company_id, client_id, scope, status, supervisor_staff_id, emergency_contact_name, emergency_contact_phone) select firm, id, 'Side elevation for windows', 'accepted', s_dan, 'Office', '01692 555 010' from clients where company_name = 'King & Sons Builders' returning id into j;
  insert into sites (company_id, job_id, address, postcode) values (firm, j, '9 Bridge Street, Fakenham', 'NR21 9AZ') returning id into si;
  insert into scaffolds (company_id, site_id, name, pricing_mode, first_lift_m, planned_start_date, planned_days) values (firm, si, 'Side elevation', 'squareage', 2.0, wk + 2, 1) returning id into sc;
  insert into job_elevations (company_id, scaffold_id, label, quoted_length_m, quoted_height_m) values (firm, sc, 'A', 12, 5);
  insert into operations (company_id, scaffold_id, type) values (firm, sc, 'put_up');
  -- 4. Accepted: on hire with a signed-off sheet, issued RAMS and an UNSIGNED handover; a HAKI tower being planned
  insert into jobs (company_id, client_id, scope, status, supervisor_staff_id, emergency_contact_name, emergency_contact_phone) select firm, id, 'Two elevations and a stair tower', 'accepted', s_dan, 'Office', '01692 555 010' from clients where company_name = 'Coastline Homes' returning id into j;
  insert into sites (company_id, job_id, address, postcode) values (firm, j, '18 Garden Street, Cromer', 'NR27 9HN') returning id into si;
  insert into scaffolds (company_id, site_id, name, pricing_mode, first_lift_m, planned_start_date, planned_days) values (firm, si, 'Front elevation', 'squareage', 2.0, wk - 10, 2) returning id into sc;
  insert into job_elevations (company_id, scaffold_id, label, quoted_length_m, quoted_height_m) values (firm, sc, 'A', 14, 8);
  insert into compliance_docs (company_id, scaffold_id, type, reference, issued_at, issued_by) values (firm, sc, 'rams', 'RAMS-R0', now() - interval '12 days', u_owner);
  insert into compliance_docs (company_id, scaffold_id, type, reference) values (firm, sc, 'tg20_21', 'TG-DEMO-0101') returning id into d;
  insert into compliance_sheets (doc_id, company_id, sheet_reference, scaffold_type, max_lift_height_m, load_class, max_leg_load_kn) values (d, firm, 'TG-DEMO-0101', 'Tied independent tube and fitting', 2.0, 'Class 2 (1.5 kN/m²)', 12.5);
  update scaffolds set status = 'on_hire', erected_at = now() - interval '9 days' where id = sc;
  insert into compliance_docs (company_id, scaffold_id, type, reference) values (firm, sc, 'handover', 'HC0001') returning id into d;
  insert into handovers (doc_id, company_id, certificate_ref, loading_class, permitted_use, max_loaded_platforms, inspecting_party, inspection_responsible_name, next_inspection_due)
    values (d, firm, 'HC0001', 'Class 2 (1.5 kN/m²)', 'Access and light duty work', '1 fully loaded + 1 at 50%', 'us', 'Dan Price', current_date - 2);
  update companies set counters = counters || '{"certificate": 1}' where id = firm;
  insert into scaffolds (company_id, site_id, name, kind, pricing_mode, first_lift_m, target_height_m, planned_start_date, planned_days) values (firm, si, 'Stair tower', 'haki_stair_tower', 'height', 2.0, 6.0, wk + 4, 1) returning id into sc;
  insert into operations (company_id, scaffold_id, type) values (firm, sc, 'put_up');
  -- 5. Accepted: erected and ready, with this week's adapt and an inspection on the board
  insert into jobs (company_id, client_id, scope, status, supervisor_staff_id) select firm, id, 'Block of flats, two elevations', 'accepted', s_lee from clients where company_name = 'Broads Housing Association' returning id into j;
  insert into sites (company_id, job_id, address, postcode) values (firm, j, 'Riverside Court, Norwich', 'NR1 1SR') returning id into si;
  insert into scaffolds (company_id, site_id, name, pricing_mode, first_lift_m, planned_start_date) values (firm, si, 'North elevation', 'meterage', 3.0, wk - 20) returning id into sc;
  insert into job_elevations (company_id, scaffold_id, label, quoted_length_m, quoted_height_m) values (firm, sc, 'A', 30, 12);
  insert into compliance_docs (company_id, scaffold_id, type, reference, issued_at) values (firm, sc, 'rams', 'RAMS-R0', now() - interval '25 days');
  insert into compliance_docs (company_id, scaffold_id, type, reference) values (firm, sc, 'bespoke_design', 'DWG-DEMO-17') returning id into d;
  insert into bespoke_designs (doc_id, company_id, designer_name, designer_position, designer_company, drawing_ref, covers) values (d, firm, 'A Engineer', 'Scaffold designer', 'Demo Design Ltd', 'DWG-DEMO-17', '3 m bottom lift over the entrance');
  update scaffolds set status = 'on_hire', erected_at = now() - interval '33 days' where id = sc;
  insert into operations (company_id, scaffold_id, type, start_date, end_date, van_id) values (firm, sc, 'adapt', wk + 1, wk + 1, v1) returning id into op;
  insert into operation_crew (company_id, operation_id, day, staff_id) values (firm, op, wk + 1, s_lee), (firm, op, wk + 1, s_tom);
  insert into operations (company_id, scaffold_id, type, start_date, end_date) values (firm, sc, 'inspection', wk + 3, wk + 3) returning id into op;
  insert into operation_crew (company_id, operation_id, day, staff_id) values (firm, op, wk + 3, s_dan);
  insert into scaffolds (company_id, site_id, name, pricing_mode, first_lift_m, planned_start_date) values (firm, si, 'South elevation', 'meterage', 2.0, wk) returning id into sc;
  insert into compliance_docs (company_id, scaffold_id, type, reference, issued_at) values (firm, sc, 'rams', 'RAMS-R0', now() - interval '2 days');
  insert into compliance_docs (company_id, scaffold_id, type, reference) values (firm, sc, 'tg20_21', 'TG-DEMO-0102');
  update scaffolds set status = 'erecting' where id = sc;
  insert into operations (company_id, scaffold_id, type, start_date, end_date, van_id) values (firm, sc, 'put_up', wk, wk + 1, v2) returning id into op;
  insert into operation_crew (company_id, operation_id, day, staff_id) values (firm, op, wk, s_dan), (firm, op, wk, s_sam), (firm, op, wk, s_jay), (firm, op, wk + 1, s_dan), (firm, op, wk + 1, s_sam);
  -- 6. Dismantle requested
  insert into jobs (company_id, client_id, scope, status) select firm, id, 'Gable end repair', 'accepted' from clients where company_name = 'Acme Builders' returning id into j;
  insert into sites (company_id, job_id, address, postcode) values (firm, j, '2 Market Place, Aylsham', 'NR11 6EH') returning id into si;
  insert into scaffolds (company_id, site_id, name, pricing_mode, first_lift_m) values (firm, si, 'Gable end', 'squareage', 2.0) returning id into sc;
  insert into compliance_docs (company_id, scaffold_id, type, reference, issued_at) values (firm, sc, 'rams', 'RAMS-R0', now() - interval '40 days');
  insert into compliance_docs (company_id, scaffold_id, type, reference) values (firm, sc, 'tg20_21', 'TG-DEMO-0090');
  update scaffolds set status = 'on_hire', erected_at = now() - interval '38 days' where id = sc;
  update scaffolds set status = 'dismantle_requested' where id = sc;
  insert into operations (company_id, scaffold_id, type, start_date, end_date) values (firm, sc, 'strike', wk + 4, wk + 4);

  -- the other firm's job (firm A must never see it)
  insert into jobs (company_id, client_id, scope) select rival, id, 'Rival job' from clients where company_id = rival returning id into j;
  insert into sites (company_id, job_id, address) values (rival, j, 'Somewhere in Norwich');
end $$;
