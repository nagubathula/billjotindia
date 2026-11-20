# Server Actions (Internal RPCs)

Billjot executes UI mutations through **Next.js Server Actions** guarded by `requireRole(...)`, `checkPosAccess()`, or `checkPosBillingAccess()` before writing via Supabase.

---

## 1. Auth & Workspaces

- **`app/(auth)/login/actions.ts`**: `signInAction` (Supabase password sign-in with safe internal `next` redirect)
- **`app/(auth)/signup/actions.ts`**: `signUpAction`, `createRestaurantAction`
- **`app/(storefront)/brands/actions.ts`**: `createBrandAction`, `attachRestaurantToBrandAction`, `detachRestaurantFromBrandAction`

---

## 2. Point of Sale (POS) & Table Tabs

- **`app/(pos)/r/[slug]/pos/actions.ts`**: `setSelectedOutletAction`
- **`app/(pos)/r/[slug]/pos/tab-actions.ts`**:
  - `listTabsAction`, `createTabAction`, `saveTabAction`, `deleteTabAction`
  - `sendKotAction` — Creates/appends items to the table's running kitchen order (`pos_tabs.order_id`)
  - `voidSentItemAction` — Manager-only voiding of sent KOT items with audit logging
  - `moveTabAction` — Transfers open table tabs and linked running orders across floor tables
  - `settleTabAction` — Finalizes and closes a running table bill
  - `chargePosToCustomerTabAction` — Charges POS bills onto a customer's Khata ledger (enforcing credit limits & Cashier/Manager/Admin access)

---

## 3. Menu, Customizations & Orders

- **`app/r/[slug]/admin/menu/actions.ts`**:
  - `createCategoryAction`, `toggleCategoryStatusAction`
  - `createProductAction`, `updateProductAction`, `toggleProductStatusAction`
  - `saveCustomizationGroupAction` (saves groups + options with `min_selections`, `max_selections`, `free_selections`, `is_default`, `max_qty`, `variant_prices`, and `veg_status`)
  - `toggleCustomizationGroupStatusAction`, `toggleCustomizationOptionStatusAction`, `cloneCustomizationGroupToOutletsAction`
- **`app/r/[slug]/admin/orders/[id]/actions.ts`**: `updateOrderStatusAction`, `cancelOrderAction` (structured reason + optional 1-click item 86ing)

---

## 4. Floor Tables & Bookings Workbench

- **`app/r/[slug]/admin/tables/actions.ts`**: `createFloorTableAction`, `bulkCreateTableRangeAction`, `applyCapacityPresetAction`, `seedDefaultFloorPlanAction`, `clearEmptyZoneTablesAction`, `clearTableTabAction`, `deleteFloorTableAction`
- **`app/r/[slug]/admin/bookings/actions.ts`**: `createStaffBookingAction`, `assignBookingTableAction`, `updateBookingStatusAction`, `seatBookingInPosAction` (auto-creates/links a table tab and applies paid deposits), `updateBookingDepositStatusAction`, `saveOutletBookingPolicyAction`

---

## 5. Back-Office Operations, Settings & Security

- **`app/r/[slug]/admin/hr/actions.ts`**: `saveEmployeeAction`, `deleteEmployeeAction`, `markAttendanceAction`, `markBulkAttendanceAction`, `recordAdvanceAction`, `deleteAdvanceAction`, `generateMonthlyPayrollAction`, `updatePayrollAdjustmentsAction`, `markPayrollPaidAction`
- **`app/r/[slug]/admin/vendors/actions.ts`**: `saveVendorAction`, `deleteVendorAction`, `createPurchaseOrderAction`, `updatePurchaseOrderStatusAction`, `recordVendorPaymentAction`
- **`app/r/[slug]/admin/accounts/actions.ts`**: `saveCustomerTabAction`, `recordTabTransactionAction`, `setCustomerTabStatusAction`, `saveCorporateClientAction`, `createCorporateInvoiceAction`, `recordCorporateInvoicePaymentAction`, `cancelCorporateInvoiceAction`, `createOutletExpenseAction`, `deleteOutletExpenseAction`
- **`app/r/[slug]/admin/customers/actions.ts`**: `createCouponAction`, `toggleCouponActiveAction`, `deleteCouponAction`
- **`app/r/[slug]/admin/channels/actions.ts`**: `saveChannelOutletAction`, `setChannelOnlineAction`
- **`app/r/[slug]/admin/settings/actions.ts`**: `updateOutletAction`, `updateCustomDomainAction`, `updatePaymentGatewaysAction`
- **`app/r/[slug]/admin/users/actions.ts`**: `createUserAction`, `resetPasswordAction`, `setUserRoleAction`, `revokeUserAction`
- **`app/r/[slug]/admin/api-keys/actions.ts`**: `createApiKeyAction`, `updateApiKeyOriginsAction`, `revokeApiKeyAction`
