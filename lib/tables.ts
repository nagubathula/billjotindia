// Floor tables are stored as POS tabs whose name encodes the table:
// "T-01 · Ground Main Hall · 4p" → code, area, seats. Shared by the admin
// floor board, the QR sheet and the table server actions so all three agree
// on which area a table belongs to.

export type RawPosTab = {
  id: string;
  outlet_id: string;
  name: string;
  lines: Array<{
    qty?: number;
    unitPrice?: number;
    product?: { name?: string };
  }>;
  updated_at: string;
};

export type OutletInfo = {
  id: string;
  name: string;
  city: string | null;
};

export function parseTableName(raw: string): {
  code: string;
  zone: string;
  seats: number;
} {
  const parts = raw.split("·").map((s) => s.trim());
  const code = parts[0] || raw.trim() || "Table";
  let zone = "Ground Main Hall";
  let seats = 4;

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const seatMatch = p.match(/^(\d+)\s*(?:p|pax|seats?)$/i);
    if (seatMatch) {
      seats = Number(seatMatch[1]);
    } else if (p) {
      zone = p;
    }
  }

  if (parts.length === 1) {
    if (/^ac/i.test(code)) {
      zone = "1st Floor Family AC";
      seats = 4;
    } else if (/^vip/i.test(code)) {
      zone = "Banquet & VIP Cabins";
      seats = 8;
    } else if (/^gh/i.test(code)) {
      zone = "Group & Bhojanam Hall";
      seats = 6;
    }
  }

  return { code, zone, seats };
}
