-- Fixed price as a pricing option (confirmed by Keith, 28 Oct 2026).
-- Kept in its own migration: Postgres cannot use a new enum value in the same transaction that adds it.
alter type public.pricing_mode add value if not exists 'fixed';
