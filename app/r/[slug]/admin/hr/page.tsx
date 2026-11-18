import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { isValidIsoDate, isValidYearMonth } from "@/lib/hr";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKey, resolveTimeZone } from "@/lib/time";
import type {
  HrAdvance,
  HrAttendance,
  HrEmployee,
  HrPayrollEntry,
} from "@/lib/types";
import { HrWorkbench } from "./HrWorkbench";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string; month?: string; tab?: string }>;
};

const VALID_TABS = new Set(["directory", "attendance", "advances", "payroll"]);

export default async function AdminHrPage(props: Props) {
  const [params, query] = await Promise.all([props.params, props.searchParams]);
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const { role } = await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/hr`,
  });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const tz = resolveTimeZone(outlets[0]?.timezone);
  const todayStr = dayKey(new Date(), tz);
  const selectedDate =
    query.date && isValidIsoDate(query.date) ? query.date : todayStr;
  const selectedMonth =
    query.month && isValidYearMonth(query.month)
      ? query.month
      : todayStr.slice(0, 7);
  const initialTab =
    query.tab && VALID_TABS.has(query.tab) ? query.tab : "directory";

  const admin = createAdminClient();
  const [employeesRes, attendanceRes, advancesRes, payrollRes] =
    await Promise.all([
      admin
        .from("hr_employees")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .order("employee_code", { ascending: true }),
      admin
        .from("hr_attendance")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("work_date", selectedDate),
      admin
        .from("hr_advances")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .order("advance_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(120),
      admin
        .from("hr_payroll_entries")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("payroll_month", selectedMonth)
        .order("created_at", { ascending: true }),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & HR"
        description="Manage kitchen & floor staff, shifts, daily attendance, salary advances, and monthly payroll."
      />

      <HrWorkbench
        slug={params.slug}
        role={role}
        outlets={outlets}
        employees={(employeesRes.data ?? []) as HrEmployee[]}
        selectedDate={selectedDate}
        selectedMonth={selectedMonth}
        initialTab={initialTab}
        attendanceOnDate={(attendanceRes.data ?? []) as HrAttendance[]}
        advances={(advancesRes.data ?? []) as HrAdvance[]}
        payrollEntries={(payrollRes.data ?? []) as HrPayrollEntry[]}
      />
    </div>
  );
}
