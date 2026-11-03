// Auth route group — split layout: branded panel + centered form card.

import Link from "next/link";
import { Receipt, CheckCircle2 } from "lucide-react";

const points = [
  "Counter billing + kitchen tickets",
  "Online ordering, no aggregator cut",
  "Multi-outlet reports in real time",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — green gradient matching the Billjot brand mark */}
      <div className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#1d1d1f_0%,#0b0b0c_100%)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:36px_36px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-[#0a84ff]/40 blur-[140px]"
        />

        <Link href="/" className="relative flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-primary">
            <Receipt className="h-4 w-4" />
          </span>
          Billjot
        </Link>

        <div className="relative">
          <h2 className="max-w-md text-4xl font-semibold leading-[1.1] tracking-[-0.03em]">
            The POS that runs your whole counter.
          </h2>
          <p className="mt-2 text-white/70">Just a better retail system.</p>
          <ul className="mt-8 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-3 text-white/90">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#2997ff]" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/60">
          Made for Indian restaurants.
        </p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center bg-muted/30 p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {/* Mobile brand mark */}
          <Link
            href="/"
            className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold lg:hidden"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Receipt className="h-4 w-4" />
            </span>
            Billjot
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
