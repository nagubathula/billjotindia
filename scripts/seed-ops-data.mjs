// Idempotent operations seed script:
// Populates Vendors, Purchase Orders, Vendor Payments, Staff HR (Employees,
// Attendance, Advances, Payroll), Coupons, People's Tabs (Khata), Corporate
// B2B Clients & GST Invoices, and Outlet Petty Cash Expenses across active restaurants.
//
// Usage: node --env-file=.env.local scripts/seed-ops-data.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing env vars. Run: node --env-file=.env.local scripts/seed-ops-data.mjs",
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function istDateStr(offsetDays = 0) {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  ist.setUTCDate(ist.getUTCDate() + offsetDays);
  return ist.toISOString().slice(0, 10);
}

function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const { data: restaurants, error: restErr } = await admin
  .from("restaurants")
  .select("id, name, slug")
  .order("created_at", { ascending: true });

if (restErr || !restaurants?.length) {
  console.error("Could not load restaurants:", restErr?.message ?? "none found");
  process.exit(1);
}

const todayStr = istDateStr(0);
const currentMonth = todayStr.slice(0, 7);
const monthDays = daysInMonth(currentMonth);

for (let rIdx = 0; rIdx < restaurants.length; rIdx++) {
  const rest = restaurants[rIdx];
  const { data: outlets } = await admin
    .from("outlets")
    .select("id, name, state, state_code, gstin")
    .eq("restaurant_id", rest.id)
    .order("created_at", { ascending: true });

  const primaryOutlet = outlets?.[0] ?? null;
  const secondaryOutlet = outlets?.[1] ?? primaryOutlet;
  const isCafe = rest.name.toLowerCase().includes("cafe");

  console.log(`\n→ Seeding operations data for: ${rest.name} (${rest.slug})`);

  // -------------------------------------------------------------------------
  // 1. VENDORS
  // -------------------------------------------------------------------------
  const vendorSeeds = [
    {
      vendor_code: "VEN-01",
      name: "Sri Lakshmi Fresh Agro Foods",
      category: "produce",
      contact_person: "Ramesh Goud",
      phone: "+91 98480 41201",
      email: "orders@lakshmiagro.in",
      gstin: "36AAECS4829K1Z2",
      address: "Bowenpally Vegetable Market Yard, Secunderabad 500011",
      payment_terms: "net_7",
      upi_or_bank: "lakshmiagro@icici",
      notes: "Daily 6:00 AM vegetable, herb & leafy greens delivery",
    },
    {
      vendor_code: "VEN-02",
      name: "Guntur Mirchi & Spice Traders",
      category: "spices",
      contact_person: "Srinivas Rao",
      phone: "+91 98491 55302",
      email: "sales@gunturspices.in",
      gstin: "37AABCC9120P1Z8",
      address: "Mirchi Yard Road, Guntur 522004, Andhra Pradesh",
      payment_terms: "net_15",
      upi_or_bank: "gunturspices@sbi",
      notes: "Teja red chillies, coriander, cardamom & spice blends",
    },
    {
      vendor_code: "VEN-03",
      name: "Heritage Creamery & Oils Distributors",
      category: "dairy_oils",
      contact_person: "Padmavathi Devi",
      phone: "+91 97012 88103",
      email: "supply@heritagefooddist.in",
      gstin: "36AAACH7341N1Z5",
      address: "Balanagar Industrial Estate, Hyderabad 500037",
      payment_terms: "net_15",
      upi_or_bank: "heritagefood@hdfcbank",
      notes: "A2 Buffalo Ghee, fresh curd, paneer, butter & milk cans",
    },
    {
      vendor_code: "VEN-04",
      name: isCafe
        ? "Chikmagalur Estate Coffee Roasters"
        : "Deccan Poultry & Coastal Seafood",
      category: isCafe ? "beverages" : "meat_seafood",
      contact_person: isCafe ? "Vikram Hegde" : "Imran Qureshi",
      phone: "+91 98852 67404",
      email: isCafe ? "b2b@estateroasters.in" : "dispatch@deccanmeats.in",
      gstin: "36AABCD4418M1Z9",
      address: isCafe
        ? "Jubilee Hills Road No. 36, Hyderabad 500033"
        : "Tolichowki Cold Chain Hub, Hyderabad 500008",
      payment_terms: "cod",
      upi_or_bank: isCafe ? "estateroast@ybl" : "deccanmeats@okaxis",
      notes: isCafe
        ? "80:20 Arabica-Chicory filter roast & cold brew beans"
        : "FSSAI certified antibiotic-free chicken, mutton & Nellore prawns",
    },
    {
      vendor_code: "VEN-05",
      name: "Telangana Rice & Pulses Millers",
      category: "grocery",
      contact_person: "Mahender Reddy",
      phone: "+91 98482 11905",
      email: "billing@telanganamills.in",
      gstin: "36AABCT8122R1Z3",
      address: "Osmangunj Grain Market, Hyderabad 500012",
      payment_terms: "net_30",
      upi_or_bank: "tmillers@axisbank",
      notes: "Aged Sona Masoori, Daawat Basmati & urad/toor dals",
    },
    {
      vendor_code: "VEN-06",
      name: "GreenPack Kraft & Foil Containers",
      category: "packaging",
      contact_person: "Anil Kumar Jain",
      phone: "+91 99123 77806",
      email: "care@greenpackindia.in",
      gstin: "29AABCG6290Q1Z1",
      address: "Peenya Industrial Area, Bengaluru 560058",
      payment_terms: "net_15",
      upi_or_bank: "greenpack@kotak",
      notes: "Tamper-evident kraft meal boxes, 750ml containers & bags",
    },
  ];

  const vendorByCode = new Map();
  for (const v of vendorSeeds) {
    const { data: existingVendor } = await admin
      .from("vendors")
      .select("*")
      .eq("restaurant_id", rest.id)
      .ilike("vendor_code", v.vendor_code)
      .maybeSingle();

    if (existingVendor) {
      vendorByCode.set(v.vendor_code, existingVendor);
    } else {
      const { data: insertedVendor, error: vErr } = await admin
        .from("vendors")
        .insert({ restaurant_id: rest.id, ...v, status: "active" })
        .select("*")
        .single();
      if (vErr) {
        console.warn(`  ! vendor ${v.vendor_code}:`, vErr.message);
      } else {
        vendorByCode.set(v.vendor_code, insertedVendor);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. PURCHASE ORDERS & VENDOR PAYMENTS
  // -------------------------------------------------------------------------
  const { count: existingPoCount } = await admin
    .from("vendor_purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", rest.id);

  if (!existingPoCount) {
    const poTemplates = [
      {
        po_number: `PO-${currentMonth.replace("-", "")}-001`,
        vendorCode: "VEN-05",
        order_date: istDateStr(-10),
        expected_date: istDateStr(-9),
        status: "received",
        invoice_number: "TM/26-27/1042",
        paidFraction: 1,
        paymentMode: "bank_transfer",
        items: [
          { name: "Aged Basmati Rice (25 kg bag)", unit: "bag", qty: 6, unit_cost: 2450, gst_rate: 5 },
          { name: "Sona Masoori Steam Rice (25 kg)", unit: "bag", qty: 5, unit_cost: 1580, gst_rate: 5 },
        ],
        notes: "Monthly grain restock checked & stacked in dry store",
      },
      {
        po_number: `PO-${currentMonth.replace("-", "")}-002`,
        vendorCode: "VEN-03",
        order_date: istDateStr(-6),
        expected_date: istDateStr(-5),
        status: "received",
        invoice_number: "HC/INV/8841",
        paidFraction: 0.5,
        paymentMode: "upi",
        items: [
          { name: "Pure Buffalo Cow Ghee (15 L tin)", unit: "tin", qty: 2, unit_cost: 8400, gst_rate: 12 },
          { name: "Refined Sunflower Oil (15 L tin)", unit: "tin", qty: 4, unit_cost: 2150, gst_rate: 5 },
          { name: "Fresh Malai Paneer Block", unit: "kg", qty: 18, unit_cost: 340, gst_rate: 5 },
        ],
        notes: "Balance 50% due under Net 15 terms",
      },
      {
        po_number: `PO-${currentMonth.replace("-", "")}-003`,
        vendorCode: "VEN-02",
        order_date: istDateStr(-4),
        expected_date: istDateStr(-2),
        status: "received",
        invoice_number: "GM-2026-519",
        paidFraction: 0,
        paymentMode: "upi",
        items: [
          { name: "Guntur Teja Red Chilli Whole", unit: "kg", qty: 15, unit_cost: 290, gst_rate: 5 },
          { name: "Whole Green Cardamom 8mm", unit: "kg", qty: 2, unit_cost: 2350, gst_rate: 5 },
          { name: "Cold-pressed Ginger Garlic Paste", unit: "kg", qty: 20, unit_cost: 145, gst_rate: 12 },
        ],
        notes: "GRN verified by kitchen head chef",
      },
      {
        po_number: `PO-${currentMonth.replace("-", "")}-004`,
        vendorCode: "VEN-01",
        order_date: istDateStr(-1),
        expected_date: todayStr,
        status: "ordered",
        invoice_number: null,
        paidFraction: 0,
        paymentMode: "cash",
        items: [
          { name: "Red Onions (50 kg sack)", unit: "bag", qty: 4, unit_cost: 1350, gst_rate: 0 },
          { name: "Country Tomatoes (25 kg crate)", unit: "crate", qty: 4, unit_cost: 780, gst_rate: 0 },
          { name: "Fresh Mint, Coriander & Curry Leaves", unit: "kg", qty: 16, unit_cost: 85, gst_rate: 0 },
        ],
        notes: "Scheduled for 6:00 AM receiving dock",
      },
      {
        po_number: `PO-${currentMonth.replace("-", "")}-005`,
        vendorCode: "VEN-06",
        order_date: todayStr,
        expected_date: istDateStr(2),
        status: "ordered",
        invoice_number: null,
        paidFraction: 0,
        paymentMode: "bank_transfer",
        items: [
          { name: "750ml Kraft Takeaway Bowls w/ Lids", unit: "pack", qty: 20, unit_cost: 420, gst_rate: 18 },
          { name: "Custom Printed Carry Bags (100 pcs)", unit: "pack", qty: 15, unit_cost: 290, gst_rate: 18 },
        ],
        notes: "Weekend delivery surge stock",
      },
    ];

    for (const tpl of poTemplates) {
      const vendor = vendorByCode.get(tpl.vendorCode);
      if (!vendor) continue;
      let subtotal = 0;
      let gstAmount = 0;
      const items = tpl.items.map((it) => {
        const ls = round2(it.qty * it.unit_cost);
        const lg = round2((ls * it.gst_rate) / 100);
        subtotal = round2(subtotal + ls);
        gstAmount = round2(gstAmount + lg);
        return {
          ...it,
          line_subtotal: ls,
          line_gst: lg,
          line_total: round2(ls + lg),
        };
      });
      const totalAmount = round2(subtotal + gstAmount);
      const amountPaid = round2(totalAmount * tpl.paidFraction);
      const paymentStatus =
        amountPaid >= totalAmount - 0.01
          ? "paid"
          : amountPaid > 0
            ? "partial"
            : "unpaid";

      const { data: insertedPo, error: poErr } = await admin
        .from("vendor_purchase_orders")
        .insert({
          restaurant_id: rest.id,
          outlet_id: primaryOutlet?.id ?? null,
          vendor_id: vendor.id,
          po_number: tpl.po_number,
          order_date: tpl.order_date,
          expected_date: tpl.expected_date,
          received_at:
            tpl.status === "received"
              ? new Date(`${tpl.expected_date}T09:30:00+05:30`).toISOString()
              : null,
          invoice_number: tpl.invoice_number,
          status: tpl.status,
          items,
          subtotal,
          gst_amount: gstAmount,
          total_amount: totalAmount,
          amount_paid: amountPaid,
          payment_status: paymentStatus,
          notes: tpl.notes,
        })
        .select("*")
        .single();

      if (poErr) {
        console.warn(`  ! PO ${tpl.po_number}:`, poErr.message);
      } else if (insertedPo && amountPaid > 0) {
        await admin.from("vendor_payments").insert({
          restaurant_id: rest.id,
          vendor_id: vendor.id,
          purchase_order_id: insertedPo.id,
          payment_date: tpl.expected_date,
          amount: amountPaid,
          payment_mode: tpl.paymentMode,
          reference_no: `UTR${490120 + rIdx * 100}`,
          note: `Settlement against ${tpl.po_number}`,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. STAFF HR (EMPLOYEES, ATTENDANCE, ADVANCES, PAYROLL)
  // -------------------------------------------------------------------------
  const staffSeeds = [
    {
      employee_code: "EMP-001",
      full_name: "Narasimha Raju K.",
      phone: "+91 98480 31001",
      department: "kitchen",
      designation: isCafe ? "Head Barista & Kitchen Lead" : "Executive Head Chef",
      employment_type: "full_time",
      shift_name: "Morning (08:00–17:00)",
      pay_type: "monthly",
      base_pay: 42000,
      upi_or_bank: "rajuchef@okicici",
    },
    {
      employee_code: "EMP-002",
      full_name: "Subba Rao M.",
      phone: "+91 98490 31002",
      department: "kitchen",
      designation: isCafe ? "Bakery & Grill Sous Chef" : "Biryani Master Chef",
      employment_type: "full_time",
      shift_name: "Full Day Split",
      pay_type: "monthly",
      base_pay: 34000,
      upi_or_bank: "subbarao@ybl",
    },
    {
      employee_code: "EMP-003",
      full_name: "Divya Sree V.",
      phone: "+91 97015 31003",
      department: "management",
      designation: "Floor Manager",
      employment_type: "full_time",
      shift_name: "General (10:30–21:30)",
      pay_type: "monthly",
      base_pay: 32000,
      upi_or_bank: "divyasree@okaxis",
    },
    {
      employee_code: "EMP-004",
      full_name: "Kiran Kumar B.",
      phone: "+91 98851 31004",
      department: "service",
      designation: "Senior Captain",
      employment_type: "full_time",
      shift_name: "Evening (13:00–23:00)",
      pay_type: "monthly",
      base_pay: 22000,
      upi_or_bank: "kirank@sbi",
    },
    {
      employee_code: "EMP-005",
      full_name: "Swathi Reddy P.",
      phone: "+91 99485 31005",
      department: "counter",
      designation: "POS Cashier & Dispatch",
      employment_type: "full_time",
      shift_name: "Morning (09:00–18:00)",
      pay_type: "monthly",
      base_pay: 19500,
      upi_or_bank: "swathi.pos@hdfcbank",
    },
    {
      employee_code: "EMP-006",
      full_name: "Prakash Goud T.",
      phone: "+91 98664 31006",
      department: "service",
      designation: "Dining Steward",
      employment_type: "full_time",
      shift_name: "Evening (13:00–23:00)",
      pay_type: "daily",
      base_pay: 650,
      upi_or_bank: "prakash@paytm",
    },
    {
      employee_code: "EMP-007",
      full_name: "Raju Naik L.",
      phone: "+91 96760 31007",
      department: "housekeeping",
      designation: "Kitchen Utility & Wash",
      employment_type: "daily_wage",
      shift_name: "Morning (07:30–16:30)",
      pay_type: "daily",
      base_pay: 550,
      upi_or_bank: "rajunaik@ybl",
    },
  ];

  const employeesList = [];
  for (let i = 0; i < staffSeeds.length; i++) {
    const emp = staffSeeds[i];
    const { data: existingEmp } = await admin
      .from("hr_employees")
      .select("*")
      .eq("restaurant_id", rest.id)
      .ilike("employee_code", emp.employee_code)
      .maybeSingle();

    if (existingEmp) {
      employeesList.push(existingEmp);
    } else {
      const { data: insEmp, error: empErr } = await admin
        .from("hr_employees")
        .insert({
          restaurant_id: rest.id,
          outlet_id: i % 2 === 0 ? primaryOutlet?.id ?? null : secondaryOutlet?.id ?? null,
          ...emp,
          joined_on: istDateStr(-120 - i * 15),
          status: "active",
        })
        .select("*")
        .single();
      if (empErr) {
        console.warn(`  ! employee ${emp.employee_code}:`, empErr.message);
      } else {
        employeesList.push(insEmp);
      }
    }
  }

  // Seed last 7 days (including todayStr) attendance idempotently
  const attendanceRows = [];
  for (let d = -6; d <= 0; d++) {
    const workDate = istDateStr(d);
    for (let i = 0; i < employeesList.length; i++) {
      const emp = employeesList[i];
      const isWeeklyOff = d === -3 && i === 5;
      const isHalfDay = d === -1 && i === 6;
      attendanceRows.push({
        restaurant_id: rest.id,
        employee_id: emp.id,
        work_date: workDate,
        status: isWeeklyOff ? "weekly_off" : isHalfDay ? "half_day" : "present",
        check_in: isWeeklyOff ? null : "09:05",
        check_out: isWeeklyOff ? null : isHalfDay ? "14:00" : "18:30",
        overtime_hours: d === -2 && i < 2 ? 2 : 0,
      });
    }
  }
  if (attendanceRows.length > 0) {
    await admin
      .from("hr_attendance")
      .upsert(attendanceRows, { onConflict: "employee_id,work_date" });
  }

  // Advances + Payroll (seed once per restaurant if empty)
  const { count: advCount } = await admin
    .from("hr_advances")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", rest.id);
  if (!advCount && employeesList.length >= 4) {
    await admin.from("hr_advances").insert([
      {
        restaurant_id: rest.id,
        employee_id: employeesList[1].id,
        advance_date: istDateStr(-5),
        amount: 3000,
        payment_mode: "upi",
        note: "Family travel advance",
      },
      {
        restaurant_id: rest.id,
        employee_id: employeesList[5].id,
        advance_date: istDateStr(-2),
        amount: 1000,
        payment_mode: "cash",
        note: "Counter cash kharchi",
      },
    ]);
  }

  const { count: payCount } = await admin
    .from("hr_payroll_entries")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", rest.id)
    .eq("payroll_month", currentMonth);

  if (!payCount && employeesList.length > 0) {
    const payrollRows = employeesList.map((emp, idx) => {
      const payableDays = idx === 6 ? monthDays - 1.5 : monthDays;
      const base = Number(emp.base_pay ?? 0);
      const grossEarned =
        emp.pay_type === "monthly"
          ? round2((base * payableDays) / monthDays)
          : round2(base * payableDays);
      const otHours = idx < 2 ? 4 : 0;
      const hourlyRate =
        emp.pay_type === "monthly" ? base / monthDays / 9 : base / 9;
      const otPay = round2(otHours * hourlyRate * 1.25);
      const advDeduction = idx === 1 ? 3000 : idx === 5 ? 1000 : 0;
      const net = Math.max(0, round2(grossEarned + otPay - advDeduction));
      return {
        restaurant_id: rest.id,
        employee_id: emp.id,
        payroll_month: currentMonth,
        days_in_month: monthDays,
        payable_days: payableDays,
        overtime_hours: otHours,
        gross_earned: grossEarned,
        overtime_pay: otPay,
        bonus_amount: 0,
        advance_deduction: advDeduction,
        other_deduction: 0,
        net_payable: net,
        payment_status: idx < 3 ? "paid" : "pending",
        payment_mode: idx < 3 ? "bank_transfer" : null,
        paid_at: idx < 3 ? new Date().toISOString() : null,
        note: `${currentMonth} auto-calculated cycle`,
      };
    });
    await admin.from("hr_payroll_entries").insert(payrollRows);
  }

  // -------------------------------------------------------------------------
  // 4. DATABASE-BACKED COUPONS
  // -------------------------------------------------------------------------
  const couponSeeds = [
    {
      code: "WELCOME50",
      title: "Flat ₹50 OFF on orders above ₹299",
      discount_type: "flat",
      discount_value: 50,
      max_discount: null,
      min_order_amount: 299,
      channel: "all",
      usage_limit: 500,
      used_count: 18,
      is_active: true,
    },
    {
      code: "ANDHRA10",
      title: "10% OFF up to ₹100 on direct orders",
      discount_type: "percentage",
      discount_value: 10,
      max_discount: 100,
      min_order_amount: 399,
      channel: "all",
      usage_limit: null,
      used_count: 42,
      is_active: true,
    },
    {
      code: "BHOJANAM100",
      title: "Flat ₹100 OFF on family meals above ₹699",
      discount_type: "flat",
      discount_value: 100,
      max_discount: null,
      min_order_amount: 699,
      channel: "all",
      usage_limit: null,
      used_count: 14,
      is_active: true,
    },
    {
      code: "LUNCH15",
      title: "15% OFF corporate dine-in specials (max ₹150)",
      discount_type: "percentage",
      discount_value: 15,
      max_discount: 150,
      min_order_amount: 450,
      channel: "pos",
      usage_limit: null,
      used_count: 9,
      is_active: true,
    },
    {
      code: "WEEKEND75",
      title: "Flat ₹75 OFF on weekend storefront orders above ₹549",
      discount_type: "flat",
      discount_value: 75,
      max_discount: null,
      min_order_amount: 549,
      channel: "storefront",
      usage_limit: 250,
      used_count: 6,
      is_active: true,
    },
  ];

  for (const cp of couponSeeds) {
    const { data: existingCp } = await admin
      .from("coupons")
      .select("id")
      .eq("restaurant_id", rest.id)
      .ilike("code", cp.code)
      .maybeSingle();

    if (!existingCp) {
      await admin.from("coupons").insert({
        restaurant_id: rest.id,
        ...cp,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5. PEOPLE'S TABS (KHATA) & TRANSACTIONS
  // -------------------------------------------------------------------------
  const { count: tabCount } = await admin
    .from("customer_tabs")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", rest.id);

  if (!tabCount) {
    const tabSeeds = [
      {
        customer_name: "Karthikeya Reddy (Cyber Towers)",
        phone: "+91 98480 61101",
        email: "karthik.reddy@techcorp.in",
        company_or_notes: "Settles every Friday evening via UPI",
        credit_limit: 10000,
        entries: [
          { type: "charge", amount: 2480, note: "Team lunch dine-in (6 guests)" },
          { type: "charge", amount: 1640, note: "Takeaway combo packs" },
          { type: "payment", amount: 1500, mode: "upi", ref: "UPI5041299", note: "Partial weekly settlement" },
        ],
      },
      {
        customer_name: "Dr. Madhavi Latha (Care Clinic)",
        phone: "+91 98492 61102",
        email: "dr.madhavi@careclinic.in",
        company_or_notes: "Doctor duty meals · Weekly cash/UPI",
        credit_limit: 8000,
        entries: [
          { type: "charge", amount: 1890, note: "Dinner parcels (4 meals)" },
          { type: "charge", amount: 960, note: "Afternoon coffee & snacks" },
        ],
      },
      {
        customer_name: "Siddharth Rao (Film Nagar Studio)",
        phone: "+91 97033 61103",
        email: "sid.rao@studiopro.in",
        company_or_notes: "Production crew dining account",
        credit_limit: 25000,
        entries: [
          { type: "charge", amount: 11400, note: "Crew buffet tray booking" },
          { type: "payment", amount: 5000, mode: "bank_transfer", ref: "NEFT99210", note: "Advance paid" },
        ],
      },
      {
        customer_name: "Anusha Deshmukh",
        phone: "+91 98850 61104",
        email: "anusha.d@gmail.com",
        company_or_notes: "Neighborhood regular patron",
        credit_limit: 4000,
        entries: [
          { type: "charge", amount: 740, note: "Family dinner takeaway" },
          { type: "payment", amount: 740, mode: "cash", ref: "CASH", note: "Settled at counter" },
        ],
      },
      {
        customer_name: "Vikramaditya Varma",
        phone: "+91 99890 61105",
        email: "vikram.varma@outlook.com",
        company_or_notes: "VIP Guest · Month-end billing",
        credit_limit: 15000,
        entries: [
          { type: "charge", amount: 3420, note: "Sunday family dining" },
          { type: "charge", amount: 1980, note: "Midweek guest dinner" },
        ],
      },
    ];

    for (const tb of tabSeeds) {
      let runningBalance = 0;
      for (const e of tb.entries) {
        runningBalance = round2(
          e.type === "charge" ? runningBalance + e.amount : runningBalance - e.amount,
        );
      }

      const { data: insTab, error: tabErr } = await admin
        .from("customer_tabs")
        .insert({
          restaurant_id: rest.id,
          outlet_id: primaryOutlet?.id ?? null,
          customer_name: tb.customer_name,
          phone: tb.phone,
          email: tb.email,
          company_or_notes: tb.company_or_notes,
          credit_limit: tb.credit_limit,
          current_balance: runningBalance,
          status: "active",
        })
        .select("*")
        .single();

      if (tabErr || !insTab) continue;

      let balCursor = 0;
      const txRows = tb.entries.map((e, idx) => {
        balCursor = round2(
          e.type === "charge" ? balCursor + e.amount : balCursor - e.amount,
        );
        return {
          restaurant_id: rest.id,
          tab_id: insTab.id,
          entry_type: e.type,
          amount: e.amount,
          balance_after: balCursor,
          payment_mode: e.mode ?? null,
          reference_no: e.ref ?? null,
          note: e.note,
          recorded_at: new Date(
            Date.now() - (tb.entries.length - idx) * 36 * 3600 * 1000,
          ).toISOString(),
        };
      });
      await admin.from("customer_tab_transactions").insert(txRows);
    }
  }

  // -------------------------------------------------------------------------
  // 6. CORPORATE CLIENTS & B2B GST TAX INVOICES
  // -------------------------------------------------------------------------
  const { count: corpCount } = await admin
    .from("corporate_clients")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", rest.id);

  if (!corpCount) {
    const corpSeeds = [
      {
        company_name: "Cyient Digital Labs Pvt Ltd",
        gstin: "36AABCN8842E1Z4",
        contact_person: "Harsha Vardhan (Workplace Ops)",
        email: "ap.hyd@cyientlabs.in",
        phone: "+91 40 2311 4500",
        billing_address: "Plot 11, Software Units Layout, Madhapur, Hyderabad 500081",
        state_name: "Telangana",
        state_code: "36",
        payment_terms: "net_15",
        credit_limit: 150000,
      },
      {
        company_name: "Novartis Healthcare Campus India",
        gstin: "36AAACK5521F1Z7",
        contact_person: "Meenakshi Iyer",
        email: "vendor.desk@novartiscampus.in",
        phone: "+91 40 6728 9000",
        billing_address: "Salarpuria Sattva Knowledge City, HITEC City, Hyderabad 500081",
        state_name: "Telangana",
        state_code: "36",
        payment_terms: "net_30",
        credit_limit: 250000,
      },
      {
        company_name: "Swish FinTech Services India Pvt Ltd",
        gstin: "29AABCS7731H1Z9",
        contact_person: "Arjun Kulkarni",
        email: "finance@swishfin.in",
        phone: "+91 80 4421 7788",
        billing_address: "Embassy TechVillage, Outer Ring Road, Bengaluru 560103",
        state_name: "Karnataka",
        state_code: "29",
        payment_terms: "net_15",
        credit_limit: 100000,
      },
    ];

    const createdClients = [];
    for (const c of corpSeeds) {
      const { data: insClient } = await admin
        .from("corporate_clients")
        .insert({ restaurant_id: rest.id, ...c, status: "active" })
        .select("*")
        .single();
      if (insClient) createdClients.push(insClient);
    }

    if (createdClients.length === 3) {
      const sellerStateCode = primaryOutlet?.state_code || "36";
      const invoiceTemplates = [
        {
          client: createdClients[0],
          invoice_number: `INV-${currentMonth.replace("-", "")}-001`,
          invoice_date: istDateStr(-12),
          due_date: istDateStr(3),
          po_reference: "PO-CY-2026-412",
          paidFraction: 1,
          lines: [
            {
              description: "Executive Townhall Lunch Buffet (80 Pax)",
              hsn_sac: "996331",
              qty: 80,
              unit_price: 420,
              gst_rate: 5,
            },
            {
              description: "Chafing Dish Setup & Live Beverage Counter",
              hsn_sac: "996339",
              qty: 1,
              unit_price: 4500,
              gst_rate: 18,
            },
          ],
          notes: "Settled via NEFT ref HDFC261190441. Thank you!",
        },
        {
          client: createdClients[1],
          invoice_number: `INV-${currentMonth.replace("-", "")}-002`,
          invoice_date: istDateStr(-4),
          due_date: istDateStr(26),
          po_reference: "NHC-PROC-9821",
          paidFraction: 0.5,
          lines: [
            {
              description: isCafe
                ? "Barista Brew & Croissant Boxes (45 Sets)"
                : "Andhra Executive Meal Boxes (45 Pax)",
              hsn_sac: "996331",
              qty: 45,
              unit_price: 360,
              gst_rate: 5,
            },
          ],
          notes: "50% advance received; balance due Net 30 days.",
        },
        {
          client: createdClients[2],
          invoice_number: `INV-${currentMonth.replace("-", "")}-003`,
          invoice_date: todayStr,
          due_date: istDateStr(15),
          po_reference: "SWF-OFFSITE-109",
          paidFraction: 0,
          lines: [
            {
              description: "Visiting Leadership Dinner Hosting (18 Pax)",
              hsn_sac: "996331",
              qty: 18,
              unit_price: 680,
              gst_rate: 5,
            },
          ],
          notes: "NEFT / UPI payable on receipt. GSTIN verified on portal.",
        },
      ];

      for (const tpl of invoiceTemplates) {
        const isInter =
          (tpl.client.state_code || "36") !== sellerStateCode;
        const supplyType = isInter ? "inter" : "intra";
        let taxableSubtotal = 0;
        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;

        const lines = tpl.lines.map((l) => {
          const taxable = round2(l.qty * l.unit_price);
          const totalGst = round2((taxable * l.gst_rate) / 100);
          const cgst = supplyType === "intra" ? round2(totalGst / 2) : 0;
          const sgst = supplyType === "intra" ? round2(totalGst - cgst) : 0;
          const igst = supplyType === "inter" ? totalGst : 0;
          taxableSubtotal = round2(taxableSubtotal + taxable);
          cgstAmount = round2(cgstAmount + cgst);
          sgstAmount = round2(sgstAmount + sgst);
          igstAmount = round2(igstAmount + igst);
          return {
            ...l,
            taxable_value: taxable,
            cgst,
            sgst,
            igst,
            total: round2(taxable + cgst + sgst + igst),
          };
        });

        const totalAmount = round2(
          taxableSubtotal + cgstAmount + sgstAmount + igstAmount,
        );
        const amountPaid = round2(totalAmount * tpl.paidFraction);
        const paymentStatus =
          amountPaid >= totalAmount - 0.01
            ? "paid"
            : amountPaid > 0
              ? "partial"
              : "unpaid";

        await admin.from("corporate_invoices").insert({
          restaurant_id: rest.id,
          outlet_id: primaryOutlet?.id ?? null,
          corporate_client_id: tpl.client.id,
          invoice_number: tpl.invoice_number,
          invoice_date: tpl.invoice_date,
          due_date: tpl.due_date,
          po_reference: tpl.po_reference,
          place_of_supply: `${tpl.client.state_code} - ${tpl.client.state_name}`,
          supply_type: supplyType,
          line_items: lines,
          taxable_subtotal: taxableSubtotal,
          cgst_amount: cgstAmount,
          sgst_amount: sgstAmount,
          igst_amount: igstAmount,
          total_amount: totalAmount,
          amount_paid: amountPaid,
          payment_status: paymentStatus,
          status: "issued",
          notes: tpl.notes,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7. OUTLET PETTY CASH & OPERATIONAL EXPENSES
  // -------------------------------------------------------------------------
  const { count: expCount } = await admin
    .from("outlet_expenses")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", rest.id);

  if (!expCount) {
    await admin.from("outlet_expenses").insert([
      {
        restaurant_id: rest.id,
        outlet_id: primaryOutlet?.id ?? null,
        expense_date: todayStr,
        category: "supplies",
        title: "Morning market fresh mint, coriander, lemons & green chillies",
        amount: 340,
        payment_mode: "cash",
        paid_to: "Monda Market Vendor",
      },
      {
        restaurant_id: rest.id,
        outlet_id: primaryOutlet?.id ?? null,
        expense_date: todayStr,
        category: "gas_fuel",
        title: "Commercial 19kg LPG cylinder exchange & delivery tip",
        amount: 185,
        payment_mode: "cash",
        paid_to: "HP Gas Agency",
      },
      {
        restaurant_id: rest.id,
        outlet_id: primaryOutlet?.id ?? null,
        expense_date: todayStr,
        category: "staff_welfare",
        title: "Staff evening tea & biscuits (cash drawer voucher)",
        amount: 210,
        payment_mode: "cash",
        paid_to: "Kitchen Tea Counter",
      },
      {
        restaurant_id: rest.id,
        outlet_id: primaryOutlet?.id ?? null,
        expense_date: istDateStr(-2),
        category: "repairs",
        title: "Deep freezer thermostat calibration & gasket seal",
        amount: 1450,
        payment_mode: "upi",
        paid_to: "CoolTech Refrigeration",
      },
      {
        restaurant_id: rest.id,
        outlet_id: secondaryOutlet?.id ?? null,
        expense_date: istDateStr(-3),
        category: "utilities",
        title: "Fiber broadband & POS backup router recharge",
        amount: 1199,
        payment_mode: "upi",
        paid_to: "ACT Fibernet",
      },
    ]);
  }

  // -------------------------------------------------------------------------
  // 8. RECENT ORDERS FOR LIVE DASHBOARD & BRAND ANALYTICS (TODAY / 7D / 30D)
  // -------------------------------------------------------------------------
  const recentCutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const sampleChannels = [
    { source: "pos", email: "pos+upi@billjot.local", type: "dine-in" },
    { source: "pos", email: "pos+cash@billjot.local", type: "takeaway" },
    { source: "pos", email: "pos+card@billjot.local", type: "dine-in" },
    { source: "web", email: "aarav.sharma@gmail.com", type: "takeaway", customer: "Aarav Sharma" },
    { source: "web", email: "diya.menon@gmail.com", type: "dine-in", customer: "Diya Menon" },
    { source: "zomato", email: "guest+zomato@billjot.local", type: "delivery", customer: "Rohan (Zomato)" },
    { source: "swiggy", email: "guest+swiggy@billjot.local", type: "delivery", customer: "Meera (Swiggy)" },
  ];

  for (const out of outlets ?? []) {
    const { count: recentCount } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("outlet_id", out.id)
      .gte("placed_at", recentCutoff);

    if (recentCount && recentCount > 0) continue;

    const { data: outProducts } = await admin
      .from("products")
      .select("id, name, price, gst_rate, hsn_code")
      .eq("outlet_id", out.id)
      .eq("status", "active")
      .limit(20);

    if (!outProducts || outProducts.length === 0) continue;

    const freshOrders = [];
    const linesByUid = new Map();
    const uidPrefix = `BJ-${out.id.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    // 4 orders today (within last few hours), plus 3 orders per day for days -1..-4
    const scheduleOffsetsMs = [
      25 * 60 * 1000,
      70 * 60 * 1000,
      140 * 60 * 1000,
      210 * 60 * 1000,
      25 * 3600 * 1000,
      28 * 3600 * 1000,
      31 * 3600 * 1000,
      49 * 3600 * 1000,
      53 * 3600 * 1000,
      56 * 3600 * 1000,
      74 * 3600 * 1000,
      78 * 3600 * 1000,
      82 * 3600 * 1000,
      98 * 3600 * 1000,
      102 * 3600 * 1000,
      106 * 3600 * 1000,
    ];

    for (let i = 0; i < scheduleOffsetsMs.length; i++) {
      const placedAt = new Date(Date.now() - scheduleOffsetsMs[i]).toISOString();
      const ch = sampleChannels[(i + rIdx) % sampleChannels.length];
      const itemCount = 1 + (i % 3);
      const orderLines = [];
      let gross = 0;
      let gstTotal = 0;

      for (let k = 0; k < itemCount; k++) {
        const prod = outProducts[(i * 2 + k) % outProducts.length];
        const qty = k === 0 && i % 2 === 0 ? 2 : 1;
        const unitPrice = Number(prod.price ?? 0);
        const gstRate = Number(prod.gst_rate ?? 5);
        const lineTotal = round2(unitPrice * qty);
        gross = round2(gross + lineTotal);
        gstTotal += lineTotal - lineTotal / (1 + gstRate / 100);
        orderLines.push({
          quantity: qty,
          unit_price: unitPrice,
          total_price: lineTotal,
          product_config: {
            product_id: prod.id,
            name: prod.name,
            base_price: unitPrice,
            gst_rate: gstRate,
            hsn_code: prod.hsn_code ?? "996331",
            selected_options: [],
          },
        });
      }

      const uid = `${uidPrefix}-${String(i + 1).padStart(2, "0")}`;
      linesByUid.set(uid, orderLines);

      const isThirdParty = ch.source === "zomato" || ch.source === "swiggy";
      const netPayout = isThirdParty ? round2(gross * 0.78) : null;
      const commission = isThirdParty ? round2(gross * 0.22) : 0;

      freshOrders.push({
        outlet_id: out.id,
        unique_order_id: uid,
        source: ch.source,
        status: i === 0 ? "preparing" : "completed",
        order_type: ch.type,
        customer_name: ch.customer ?? (ch.source === "pos" ? "Walk-in" : "Guest"),
        customer_email: ch.email,
        subtotal: round2(gross - gstTotal),
        cgst_amount: isThirdParty ? 0 : round2(gstTotal / 2),
        sgst_amount: isThirdParty ? 0 : round2(gstTotal / 2),
        igst_amount: 0,
        gst_paid_by_operator: isThirdParty,
        takeaway_charges: 0,
        discount_amount: 0,
        rounding_amount: 0,
        commission_amount: commission,
        net_payout: netPayout,
        total_amount: gross,
        payment_status: "paid",
        payment_provider: ch.source === "pos" ? "pos" : ch.source,
        placed_at: placedAt,
        created_at: placedAt,
        updated_at: placedAt,
      });
    }

    const { data: insertedOrders, error: insOrdErr } = await admin
      .from("orders")
      .insert(freshOrders)
      .select("id, unique_order_id");

    if (insOrdErr) {
      console.warn(`  ! recent orders for ${out.name}:`, insOrdErr.message);
      continue;
    }

    const orderItemRows = [];
    for (const row of insertedOrders ?? []) {
      const items = linesByUid.get(row.unique_order_id) ?? [];
      for (const it of items) {
        orderItemRows.push({ order_id: row.id, ...it });
      }
    }
    if (orderItemRows.length > 0) {
      await admin.from("order_items").insert(orderItemRows);
    }
    console.log(`  ✓ Seeded ${insertedOrders?.length ?? 0} recent orders for ${out.name}`);
  }
}

console.log("\n✓ Completed seeding operations data across all restaurants.");
