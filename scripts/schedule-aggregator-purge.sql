-- Schedule the nightly clean-up of data delivery platforms send us.
-- Run once in the Supabase SQL editor (Dashboard → SQL), after migration
-- 20261111090000_aggregator_order_handling. Needs the pg_cron extension
-- (Dashboard → Database → Extensions). Safe to re-run.
--
-- Every night at 03:00 IST, for each channel below, orders older than the
-- retention period lose the customer's name, phone, rider details and the raw
-- platform payload, and webhook events of that age are deleted. THIS CANNOT BE
-- UNDONE. Amounts, items and tax are kept.
--
-- Change '90 days' to the retention period you have agreed to before running.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron is not enabled — turn it on under Database → Extensions first';
  end if;

  perform cron.unschedule(jobid)
     from cron.job
    where jobname = 'purge-aggregator-data';

  perform cron.schedule(
    'purge-aggregator-data',
    '30 21 * * *',  -- 21:30 UTC = 03:00 IST
    $job$
      select public.purge_channel_data(c, interval '90 days')
        from unnest(array['zomato','swiggy','magicpin','dunzo','ondc','uber-eats','dotpe','other']) as c
    $job$
  );
end $$;

-- To run it once by hand:
--   select * from public.purge_channel_data('zomato', interval '90 days');
-- To wipe everything a channel sent (e.g. when the integration ends):
--   select * from public.purge_channel_data('zomato', interval '0');
-- To stop the nightly job:
--   select cron.unschedule(jobid) from cron.job where jobname = 'purge-aggregator-data';
