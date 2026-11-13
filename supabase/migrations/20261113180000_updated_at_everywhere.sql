-- Keep updated_at honest on every table that has one.
--
-- set_updated_at() (20260525150017) was only attached to a handful of tables,
-- so orders, products, categories, add-ons, banners and others kept the
-- updated_at of the moment they were created: an order cancelled an hour later
-- still looked untouched. Frontends polling GET /api/orders/{id} and anything
-- syncing "what changed since" rely on it.
--
-- This attaches the trigger to every public table with an updated_at column,
-- including tables added later as long as this migration is re-run. Rows keep
-- their current values until their next update.
--
-- Idempotent: drops and recreates each trigger.

begin;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

commit;
