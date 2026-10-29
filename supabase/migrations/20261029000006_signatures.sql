-- Saved signatures and signing PINs (Keith, 29 Oct 2026).
-- A saved signature is applied only by a deliberate action of the signed-in person. A RAMS and an inspection report
-- also need the person's signing PIN at that moment. PINs are hashed and kept in the private schema, which the
-- website cannot reach: only the functions below read or change them, and only for the signed-in person.

alter table public.profiles add column if not exists can_sign_rams boolean not null default false;
alter table public.profiles add column if not exists signature_updated_at timestamptz;

alter table public.handovers add column if not exists issued_by_profile_id uuid references public.profiles(id);
alter table public.handovers add column if not exists issued_signature_path text;
alter table public.handovers add column if not exists issued_signed_at timestamptz;

alter table public.inspections add column if not exists inspector_signature_path text;
alter table public.inspections add column if not exists signed_at timestamptz;

create table if not exists private.signing_pins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on private.signing_pins from public, anon, authenticated;

-- 'ok', 'wrong', 'locked' (5 wrong tries lock signing for 15 minutes) or 'no_pin'
create or replace function private.check_signing_pin(p_pin text) returns text
language plpgsql security definer set search_path = public as $$
declare r private.signing_pins; tries int;
begin
  if auth.uid() is null then return 'no_pin'; end if;
  select * into r from private.signing_pins where profile_id = auth.uid() for update;
  if not found then return 'no_pin'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;
  if extensions.crypt(coalesce(p_pin, ''), r.pin_hash) = r.pin_hash then
    update private.signing_pins set failed_attempts = 0, locked_until = null where profile_id = auth.uid();
    return 'ok';
  end if;
  tries := case when r.locked_until is not null then 1 else r.failed_attempts + 1 end;   -- a lock that has run out starts the count again
  update private.signing_pins set failed_attempts = tries,
         locked_until = case when tries >= 5 then now() + interval '15 minutes' else null end
   where profile_id = auth.uid();
  return case when tries >= 5 then 'locked' else 'wrong' end;
end $$;

-- 'ok', 'bad_format', 'wrong_current' or 'locked'. Changing an existing PIN needs the current one.
create or replace function private.set_signing_pin(p_pin text, p_current text default null) returns text
language plpgsql security definer set search_path = public as $$
declare status text;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = 'insufficient_privilege'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,6}$' then return 'bad_format'; end if;
  if exists (select 1 from private.signing_pins where profile_id = auth.uid()) then
    status := private.check_signing_pin(p_current);
    if status <> 'ok' then return case when status = 'locked' then 'locked' else 'wrong_current' end; end if;
  end if;
  insert into private.signing_pins (profile_id, pin_hash) values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (profile_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  return 'ok';
end $$;

create or replace function private.has_signing_pin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from private.signing_pins where profile_id = auth.uid());
$$;

-- the owner can clear a forgotten PIN for someone in their own firm; that person then sets a new one
create or replace function private.clear_signing_pin(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if private.my_role() is distinct from 'owner'
     or not exists (select 1 from public.profiles where id = p_profile and company_id = private.my_company()) then
    raise exception 'only the owner can reset a signing PIN in their own firm' using errcode = 'insufficient_privilege';
  end if;
  delete from private.signing_pins where profile_id = p_profile;
end $$;

-- a person sets their own saved signature; the file must be in their own folder
create or replace function private.set_my_signature(p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = 'insufficient_privilege'; end if;
  if p_path is not null and p_path not like (private.my_company()::text || '/' || auth.uid()::text || '/%') then
    raise exception 'a saved signature must be in the signer''s own folder' using errcode = 'insufficient_privilege';
  end if;
  update public.profiles set signature_path = p_path,
         signature_updated_at = case when p_path is null then null else now() end
   where id = auth.uid();
end $$;

grant execute on function private.check_signing_pin(text), private.set_signing_pin(text, text), private.has_signing_pin(),
  private.clear_signing_pin(uuid), private.set_my_signature(text) to authenticated;
