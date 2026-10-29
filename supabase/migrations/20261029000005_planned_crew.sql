-- Planned crew size: fills "manpower" on the RAMS before the put-up can be put on the board.
-- Same reason as planned_start_date and planned_days: rule 2 blocks scheduling until the RAMS is issued,
-- and the RAMS needs these details before it can be issued.
alter table public.scaffolds add column if not exists planned_crew int;
alter table public.scaffolds drop constraint if exists scaffolds_planned_crew_positive;
alter table public.scaffolds add constraint scaffolds_planned_crew_positive check (planned_crew is null or planned_crew > 0);
alter table public.scaffolds drop constraint if exists scaffolds_planned_days_positive;
alter table public.scaffolds add constraint scaffolds_planned_days_positive check (planned_days is null or planned_days > 0);
