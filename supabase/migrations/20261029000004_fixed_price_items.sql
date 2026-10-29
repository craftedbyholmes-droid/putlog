-- Fixed-price scaffolds: one main price plus any priced extras, stored on the scaffold (so on its site).
-- Each entry: {"id": text, "description": text, "price": number}. The quote adds one line per entry.
alter table public.scaffolds add column if not exists price_items jsonb not null default '[]'::jsonb;
alter table public.scaffolds drop constraint if exists scaffolds_price_items_is_array;
alter table public.scaffolds add constraint scaffolds_price_items_is_array check (jsonb_typeof(price_items) = 'array');

-- A fixed-price HAKI tower still records its bill of materials (it doubles as the yard pull sheet),
-- so the tower calculation table must accept 'fixed' as well as 'height' and 'component'.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.haki_calculations'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%pricing_mode%'
  loop
    execute format('alter table public.haki_calculations drop constraint %I', c);
  end loop;
end $$;
alter table public.haki_calculations add constraint haki_calculations_pricing_mode_check
  check (pricing_mode in ('height', 'component', 'fixed'));
