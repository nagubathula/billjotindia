"use client";

import { useEffect } from "react";

// Auto-fires the browser print dialog on mount. Lives in its own file so the
// receipt page itself can stay a server component (no client boundary cost
// for the actual receipt layout).
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
