-- Payment Gateway integration metadata for Razorpay, Stripe, and Dynamic UPI QR.
-- Per-outlet encrypted/service-role gateway credentials are also supported via
-- payment_sessions ('gateway_config:<outlet_id>') for zero-downtime compatibility.

begin;

alter table public.orders
  add column if not exists stripe_session_id text,
  add column if not exists payment_status text default 'unpaid',
  add column if not exists payment_provider text;

create index if not exists idx_orders_razorpay_order_id
  on public.orders(razorpay_order_id)
  where razorpay_order_id is not null;

create index if not exists idx_orders_stripe_session_id
  on public.orders(stripe_session_id)
  where stripe_session_id is not null;

commit;
