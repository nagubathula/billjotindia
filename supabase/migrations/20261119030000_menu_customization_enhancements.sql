begin;

alter table public.customization_groups
  add column if not exists min_selections integer not null default 0
    check (min_selections >= 0),
  add column if not exists max_selections integer null
    check (max_selections is null or max_selections >= 1),
  add column if not exists free_selections integer not null default 0
    check (free_selections >= 0);

update public.customization_groups
   set min_selections = 1
 where coalesce(is_required, false) = true
   and min_selections = 0;

alter table public.customization_options
  add column if not exists veg_status text not null default 'Veg'
    check (veg_status in ('Veg', 'Egg', 'Non-Veg')),
  add column if not exists is_default boolean not null default false,
  add column if not exists max_qty integer not null default 1
    check (max_qty >= 1 and max_qty <= 20),
  add column if not exists variant_prices jsonb not null default '{}'::jsonb;

alter table public.product_customizations
  add column if not exists is_required_override boolean null;

commit;
