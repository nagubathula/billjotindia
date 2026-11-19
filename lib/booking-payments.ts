import { createAdminClient } from "@/lib/supabase/admin";
import type { TableBooking } from "@/lib/types";

export type BookingDepositSessionData = {
  kind: "table_booking_deposit";
  booking_id: string;
  outlet_id: string;
  restaurant_slug: string;
  amount: number;
};

export function isBookingDepositSession(
  raw: unknown,
): raw is BookingDepositSessionData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  return (
    obj.kind === "table_booking_deposit" &&
    typeof obj.booking_id === "string" &&
    typeof obj.outlet_id === "string"
  );
}

export async function finalizePaidBookingDeposit(params: {
  sessionReference: string;
  gateway: "razorpay" | "stripe";
  paymentId: string;
}): Promise<
  { ok: true; booking: TableBooking } | { ok: false; error: string }
> {
  const admin = createAdminClient();
  const { data: sessionRow } = await admin
    .from("payment_sessions")
    .select("order_data")
    .eq("order_reference", params.sessionReference)
    .maybeSingle();

  if (!sessionRow || !isBookingDepositSession(sessionRow.order_data)) {
    return { ok: false, error: "Deposit payment session not found or expired" };
  }

  const sessionData = sessionRow.order_data;
  const { data: booking } = await admin
    .from("table_bookings")
    .select("*")
    .eq("id", sessionData.booking_id)
    .eq("outlet_id", sessionData.outlet_id)
    .maybeSingle();

  if (!booking) {
    return { ok: false, error: "Booking not found for this payment" };
  }

  if (booking.deposit_status === "paid" && booking.status !== "pending_payment") {
    return { ok: true, booking: booking as TableBooking };
  }

  const nextStatus =
    booking.status === "pending_payment" || booking.status === "pending"
      ? "confirmed"
      : booking.status;

  const { data: updated, error } = await admin
    .from("table_bookings")
    .update({
      status: nextStatus,
      deposit_status: "paid",
      payment_provider: params.gateway,
      payment_reference: params.paymentId,
    })
    .eq("id", booking.id)
    .select("*")
    .single();

  if (error || !updated) {
    return {
      ok: false,
      error: error?.message ?? "Failed to update booking deposit status",
    };
  }

  return { ok: true, booking: updated as TableBooking };
}
