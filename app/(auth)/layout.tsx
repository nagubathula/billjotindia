import Link from "next/link";
import {
  ChefHat,
  MonitorSmartphone,
  Receipt,
  ShieldCheck,
} from "lucide-react";

const PILLARS = [
  {
    icon: MonitorSmartphone,
    title: "Counter POS & Table KOT",
    desc: "Instant dine-in & takeaway billing with running table tickets.",
  },
  {
    icon: ChefHat,
    title: "Live Kitchen Display",
    desc: "Real-time station routing, multi-KOT highlights, and prep timers.",
  },
  {
    icon: ShieldCheck,
    title: "Multi-Outlet & GST Ready",
    desc: "Role-based staff access, API storefronts, and clean tax ledgers.",
  },
] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.04fr_1fr]">
      {/* Left architectural showcase panel (desktop) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-10 text-slate-100 lg:flex xl:p-14">
        {/* Ambient radial emerald + teal glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 h-[440px] w-[440px] rounded-full bg-emerald-500/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-32 h-[420px] w-[420px] rounded-full bg-teal-500/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]"
        />

        {/* Top Brand Mark */}
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25">
            <Receipt className="h-5 w-5 stroke-[2.25]" />
          </span>
          <div>
            <span className="text-lg font-bold tracking-tight text-white">
              Billjot
            </span>
            <span className="ml-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-300 uppercase">
              Console
            </span>
          </div>
        </div>

        {/* Center Copy & Pillars */}
        <div className="relative z-10 my-auto max-w-lg py-10">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-white xl:text-4xl">
            Run every counter, kitchen, and outlet in one place.
          </h2>
          <p className="mt-3.5 text-sm leading-relaxed text-slate-400">
            Fast, distraction-free operations built for Indian restaurants,
            cafes, and multi-outlet brands.
          </p>

          <div className="mt-8 space-y-3">
            {PILLARS.map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xs transition-colors hover:bg-white/[0.06]"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25">
                  <item.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    {item.title}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-400">
                    {item.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Status Strip */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="text-slate-400">All POS &amp; KDS services live</span>
          </div>
          <span>app.billjot.com</span>
        </div>
      </aside>

      {/* Right form column */}
      <div className="relative flex flex-col justify-between bg-gradient-to-b from-emerald-50/50 via-background to-background px-5 py-10 sm:px-10 dark:from-emerald-950/20">
        {/* Mobile/Tablet Brand Header */}
        <div className="flex items-center justify-center lg:hidden">
          <Link href="/login" className="inline-flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Receipt className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">Billjot</span>
          </Link>
        </div>

        <main className="mx-auto my-auto w-full max-w-[420px] py-6">
          {children}
        </main>

        <footer className="text-center text-xs text-muted-foreground">
          Billjot · Restaurant Operations &amp; POS
        </footer>
      </div>
    </div>
  );
}
