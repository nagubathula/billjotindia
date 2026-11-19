import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticateApiKeyAnyScope,
  generateApiKey,
  hashApiKey,
  isApiKeyScope,
} from "@/lib/api-keys";
import {
  buildBookingWhatsAppUrl,
  checkSlotAvailability,
  computeBookingDeposit,
  estimateWaitlistMinutes,
  findBestAvailableTable,
  generateAvailableSlotsForDate,
  getUpcomingReservationForTable,
  isBlockingReservation,
  parseOutletFloorTables,
  wallClockDateTimeToIso,
  type BookingScheduleRow,
} from "@/lib/bookings";
import type { createAdminClient } from "@/lib/supabase/admin";

function makeMockKeySupabase(row: {
  id: string;
  restaurant_id: string;
  outlet_id: string | null;
  scopes: string[];
  allowed_origins: string[];
  revoked_at: string | null;
  last_used_at: string | null;
  key_hash: string;
} | null) {
  return {
    from() {
      let hashFilter: string | null = null;
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: string) {
          if (col === "key_hash") hashFilter = val;
          return builder;
        },
        update() {
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
        async maybeSingle() {
          if (row && row.key_hash === hashFilter) {
            return { data: row, error: null };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  } as unknown as ReturnType<typeof createAdminClient>;
}

test("parseOutletFloorTables skips Counter/blank tabs and parses zones and seats", () => {
  const parsed = parseOutletFloorTables([
    { id: "c1", name: "Counter" },
    { id: "e1", name: "   " },
    { id: "t1", name: "T-01 · Patio · 2p" },
    { id: "t2", name: "T-02 · Main Hall · 4p" },
    { id: "t3", name: "T-03 · Main Hall · 6p" },
  ]);

  assert.equal(parsed.length, 3);
  assert.deepEqual(
    parsed.map((t) => ({ id: t.id, code: t.code, zone: t.zone, seats: t.seats })),
    [
      { id: "t1", code: "T-01", zone: "Patio", seats: 2 },
      { id: "t2", code: "T-02", zone: "Main Hall", seats: 4 },
      { id: "t3", code: "T-03", zone: "Main Hall", seats: 6 },
    ],
  );
});

test("checkSlotAvailability & findBestAvailableTable: tightest fit, zones, conflicts & unassigned pool", () => {
  const tables = parseOutletFloorTables([
    { id: "t6", name: "T-03 · Main Hall · 6p" },
    { id: "t4", name: "T-02 · Main Hall · 4p" },
    { id: "t2", name: "T-01 · Patio · 2p" },
  ]);

  const slotStartMs = Date.parse("2026-11-23T13:30:00Z"); // 19:00 IST

  // Tightest fit for party of 2 picks the 2-top, not 4p or 6p
  const res2 = findBestAvailableTable({
    tables,
    bookings: [],
    slotStartMs,
    durationMinutes: 90,
    partySize: 2,
    nowMs: slotStartMs - 60 * 60_000,
  });
  assert.equal(res2.available, true);
  assert.equal(res2.suggestedTableId, "t2");
  assert.equal(res2.remainingTables, 3);

  // Preferred zone respected when fitting table exists
  const mainFor2 = checkSlotAvailability({
    tables,
    bookings: [],
    slotStartMs,
    durationMinutes: 90,
    partySize: 2,
    preferredZone: "Main Hall",
    nowMs: slotStartMs - 60 * 60_000,
  });
  assert.equal(mainFor2.available, true);
  assert.equal(mainFor2.suggestedTableId, "t4");
  assert.equal(mainFor2.remainingTables, 2);

  // Preferred zone with no fitting table returns unavailable
  const patioFor4 = checkSlotAvailability({
    tables,
    bookings: [],
    slotStartMs,
    durationMinutes: 90,
    partySize: 4,
    preferredZone: "Patio",
    nowMs: slotStartMs - 60 * 60_000,
  });
  assert.equal(patioFor4.available, false);
  assert.equal(patioFor4.suggestedTableId, null);

  // Specific table conflict vs excludeBookingId
  const existingOnT4: BookingScheduleRow = {
    id: "bk-1",
    table_id: "t4",
    booking_type: "reservation",
    status: "confirmed",
    party_size: 4,
    reserved_for: new Date(slotStartMs + 30 * 60_000).toISOString(),
    duration_minutes: 90,
  };
  const conflictT4 = checkSlotAvailability({
    tables,
    bookings: [existingOnT4],
    slotStartMs,
    durationMinutes: 90,
    partySize: 4,
    specificTableId: "t4",
    nowMs: slotStartMs - 60 * 60_000,
  });
  assert.equal(conflictT4.available, false);

  const editSelfT4 = checkSlotAvailability({
    tables,
    bookings: [existingOnT4],
    slotStartMs,
    durationMinutes: 90,
    partySize: 4,
    specificTableId: "t4",
    excludeBookingId: "bk-1",
    nowMs: slotStartMs - 60 * 60_000,
  });
  assert.equal(editSelfT4.available, true);
  assert.equal(editSelfT4.suggestedTableId, "t4");

  // Unassigned reservation pool capacity protection:
  // With only 2 tables (2p and 4p), an overlapping unassigned 4-guest booking holds the 4p table.
  const twoTableFloor = tables.filter((t) => t.id === "t2" || t.id === "t4");
  const unassigned4: BookingScheduleRow = {
    id: "bk-unassigned",
    table_id: null,
    booking_type: "reservation",
    status: "confirmed",
    party_size: 4,
    reserved_for: new Date(slotStartMs).toISOString(),
    duration_minutes: 90,
  };
  const second4 = checkSlotAvailability({
    tables: twoTableFloor,
    bookings: [unassigned4],
    slotStartMs,
    durationMinutes: 90,
    partySize: 4,
    nowMs: slotStartMs - 60 * 60_000,
  });
  assert.equal(second4.available, false);

  const another2 = checkSlotAvailability({
    tables: twoTableFloor,
    bookings: [unassigned4],
    slotStartMs,
    durationMinutes: 90,
    partySize: 2,
    nowMs: slotStartMs - 60 * 60_000,
  });
  assert.equal(another2.available, true);
  assert.equal(another2.suggestedTableId, "t2");
});

test("isBlockingReservation holds pending_payment <20m and releases after 20m", () => {
  const nowMs = Date.parse("2026-11-23T14:00:00Z");

  assert.equal(
    isBlockingReservation(
      {
        booking_type: "reservation",
        status: "pending_payment",
        created_at: new Date(nowMs - 10 * 60_000).toISOString(),
      },
      nowMs,
    ),
    true,
  );

  assert.equal(
    isBlockingReservation(
      {
        booking_type: "reservation",
        status: "pending_payment",
        created_at: new Date(nowMs - 25 * 60_000).toISOString(),
      },
      nowMs,
    ),
    false,
  );

  assert.equal(
    isBlockingReservation(
      {
        booking_type: "waitlist",
        status: "confirmed",
        created_at: new Date(nowMs).toISOString(),
      },
      nowMs,
    ),
    false,
  );
});

test("generateAvailableSlotsForDate handles opening hours, cutoff, turn overlap & closed weekdays", () => {
  const openingHours = {
    mon: [{ open: "12:00", close: "14:00" }],
    tue: [],
    wed: [{ open: "12:00", close: "14:00" }],
    thu: [{ open: "12:00", close: "14:00" }],
    fri: [{ open: "12:00", close: "14:00" }],
    sat: [{ open: "12:00", close: "14:00" }],
    sun: [{ open: "12:00", close: "14:00" }],
  };

  const singleTable = parseOutletFloorTables([
    { id: "t1", name: "T-01 · Main Hall · 4p" },
  ]);

  // 2026-11-23 is Monday in Asia/Kolkata
  const nowIso = wallClockDateTimeToIso("2026-11-23", "11:00", "Asia/Kolkata")!;
  const booked12Iso = wallClockDateTimeToIso("2026-11-23", "12:00", "Asia/Kolkata")!;

  const slotsWithBookedNoon = generateAvailableSlotsForDate({
    dateStr: "2026-11-23",
    timeZone: "Asia/Kolkata",
    openingHours,
    slotMinutes: 30,
    turnMinutes: 90,
    partySize: 2,
    tables: singleTable,
    bookings: [
      {
        id: "b1",
        table_id: "t1",
        booking_type: "reservation",
        status: "confirmed",
        party_size: 2,
        reserved_for: booked12Iso,
        duration_minutes: 90,
      },
    ],
    nowMs: Date.parse(nowIso),
  });

  // 12:00 booking lasts 90m (12:00-13:30), overlapping 12:00, 12:30, 13:00; 13:30 stays open
  assert.deepEqual(
    slotsWithBookedNoon.map((s) => ({ time: s.time, available: s.available })),
    [
      { time: "12:00", available: false },
      { time: "12:30", available: false },
      { time: "13:00", available: false },
      { time: "13:30", available: true },
    ],
  );

  // Cutoff check: at 12:20 IST, slots before 12:35 IST (12:00 & 12:30) are unavailable even with free table
  const midLunchIso = wallClockDateTimeToIso("2026-11-23", "12:20", "Asia/Kolkata")!;
  const slotsAt1220 = generateAvailableSlotsForDate({
    dateStr: "2026-11-23",
    timeZone: "Asia/Kolkata",
    openingHours,
    slotMinutes: 30,
    turnMinutes: 90,
    partySize: 2,
    tables: singleTable,
    bookings: [],
    nowMs: Date.parse(midLunchIso),
  });
  assert.deepEqual(
    slotsAt1220.map((s) => ({ time: s.time, available: s.available })),
    [
      { time: "12:00", available: false },
      { time: "12:30", available: false },
      { time: "13:00", available: true },
      { time: "13:30", available: true },
    ],
  );

  // 2026-11-24 is Tuesday -> closed -> empty slots
  const tuesdaySlots = generateAvailableSlotsForDate({
    dateStr: "2026-11-24",
    timeZone: "Asia/Kolkata",
    openingHours,
    slotMinutes: 30,
    turnMinutes: 90,
    partySize: 2,
    tables: singleTable,
    bookings: [],
    nowMs: Date.parse(nowIso),
  });
  assert.deepEqual(tuesdaySlots, []);
});

test("computeBookingDeposit, estimateWaitlistMinutes, getUpcomingReservationForTable & WhatsApp URLs", () => {
  assert.equal(computeBookingDeposit(3, 250, 4), 0);
  assert.equal(computeBookingDeposit(4, 250, 4), 1000);
  assert.equal(computeBookingDeposit(5, 0, 1), 0);

  assert.equal(
    estimateWaitlistMinutes({ activeWaitlistCount: 0, partySize: 2, totalTablesCount: 8 }),
    10,
  );
  assert.equal(
    estimateWaitlistMinutes({ activeWaitlistCount: 4, partySize: 6, totalTablesCount: 6 }),
    50, // 10 + round(180/6)=30 + 10 partyBump
  );
  assert.equal(
    estimateWaitlistMinutes({ activeWaitlistCount: 25, partySize: 8, totalTablesCount: 4 }),
    120,
  );

  const nowMs = Date.parse("2026-11-23T12:00:00Z");
  const upcoming = getUpcomingReservationForTable(
    "t1",
    [
      {
        table_id: "t1",
        booking_type: "reservation",
        status: "cancelled",
        customer_name: "Cancelled Guest",
        party_size: 2,
        reserved_for: new Date(nowMs + 15 * 60_000).toISOString(),
      },
      {
        table_id: "t1",
        booking_type: "reservation",
        status: "confirmed",
        customer_name: "Far Future",
        party_size: 2,
        reserved_for: new Date(nowMs + 180 * 60_000).toISOString(),
      },
      {
        table_id: "t1",
        booking_type: "reservation",
        status: "confirmed",
        customer_name: "Ananya Verma",
        party_size: 4,
        reserved_for: new Date(nowMs + 45 * 60_000).toISOString(),
      },
    ],
    nowMs,
  );
  assert.ok(upcoming);
  assert.equal(upcoming.booking.customer_name, "Ananya Verma");
  assert.equal(upcoming.minutesUntil, 45);

  const waConfirmed = buildBookingWhatsAppUrl({
    phone: "98490 11223",
    customerName: "Ananya",
    restaurantName: "Manaruchulu",
    bookingCode: "RES-DEMO01",
    kind: "confirmed",
    reservedFor: new Date(nowMs + 60 * 60_000).toISOString(),
    partySize: 4,
    tableCode: "AC-01",
    timeZone: "Asia/Kolkata",
  });
  assert.ok(waConfirmed?.startsWith("https://wa.me/919849011223?text="));
  assert.ok(decodeURIComponent(waConfirmed!).includes("RES-DEMO01"));

  const waWaitlist = buildBookingWhatsAppUrl({
    phone: "+91 98111 33445",
    customerName: "Rohan",
    restaurantName: "Manaruchulu",
    bookingCode: "WL-DEMO01",
    kind: "waitlist_ready",
    partySize: 2,
  });
  assert.ok(waWaitlist?.startsWith("https://wa.me/919811133445?text="));
  assert.ok(decodeURIComponent(waWaitlist!).includes("is ready!"));

  const waReminder = buildBookingWhatsAppUrl({
    phone: "9848044556",
    customerName: "Karthik",
    restaurantName: "Manaruchulu",
    bookingCode: "RES-DEMO02",
    kind: "reminder",
    reservedFor: new Date(nowMs + 90 * 60_000).toISOString(),
    partySize: 2,
  });
  assert.ok(waReminder?.startsWith("https://wa.me/919848044556?text="));
  assert.ok(decodeURIComponent(waReminder!).includes("Reminder from Manaruchulu"));

  assert.equal(
    buildBookingWhatsAppUrl({
      phone: "123",
      customerName: "Bad",
      restaurantName: "Test",
      bookingCode: "RES-X",
      kind: "confirmed",
      partySize: 2,
    }),
    null,
  );
});

test("isApiKeyScope & authenticateApiKeyAnyScope support bookings:read and bookings:write", async () => {
  assert.equal(isApiKeyScope("bookings:read"), true);
  assert.equal(isApiKeyScope("bookings:write"), true);
  assert.equal(isApiKeyScope("bookings:admin"), false);

  const readKey = generateApiKey();
  const readDb = makeMockKeySupabase({
    id: "key-read-1",
    restaurant_id: "11111111-1111-4111-8111-111111111111",
    outlet_id: null,
    scopes: ["bookings:read"],
    allowed_origins: [],
    revoked_at: null,
    last_used_at: new Date().toISOString(),
    key_hash: hashApiKey(readKey.key),
  });

  const readReq = new Request("https://app.example/api/bookings", {
    headers: { Authorization: `Bearer ${readKey.key}` },
  });

  const okAny = await authenticateApiKeyAnyScope(
    readReq,
    ["bookings:read", "bookings:write"],
    readDb,
  );
  assert.equal(okAny.ok, true);

  const deniedWrite = await authenticateApiKeyAnyScope(
    readReq,
    ["bookings:write"],
    readDb,
  );
  assert.equal(deniedWrite.ok, false);
  if (!deniedWrite.ok) assert.equal(deniedWrite.status, 403);

  const writeKey = generateApiKey();
  const writeDb = makeMockKeySupabase({
    id: "key-write-1",
    restaurant_id: "11111111-1111-4111-8111-111111111111",
    outlet_id: null,
    scopes: ["bookings:write"],
    allowed_origins: [],
    revoked_at: null,
    last_used_at: new Date().toISOString(),
    key_hash: hashApiKey(writeKey.key),
  });

  const writeReq = new Request("https://app.example/api/bookings", {
    method: "POST",
    headers: { "x-api-key": writeKey.key },
  });

  const okWrite = await authenticateApiKeyAnyScope(
    writeReq,
    ["bookings:write"],
    writeDb,
  );
  assert.equal(okWrite.ok, true);

  const okReadViaWrite = await authenticateApiKeyAnyScope(
    writeReq,
    ["bookings:read", "bookings:write"],
    writeDb,
  );
  assert.equal(okReadViaWrite.ok, true);
});
