-- Captain (waiter) staff role.
--
-- Captains open the POS to take table orders and hold them for the kitchen,
-- but can't take payments, give discounts or open admin pages. The app
-- enforces that (lib/roles.ts, lib/pos-auth.ts). In the database a captain is
-- a staff member like a cashier: policies that check "any role in this
-- restaurant" include them, and policies that name admin/manager don't.
--
-- Adding an enum value can't be undone with a plain ALTER; to remove it later,
-- first move any captains to another role.

alter type public.app_role add value if not exists 'captain';
