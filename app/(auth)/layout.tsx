// Auth route group — a single quiet column: brand mark, title, form.

import Link from "next/link";
import { Receipt } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-[400px]">
          <Link
            href="/"
            aria-label="Billjot home"
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-card transition-transform duration-200 hover:scale-105"
          >
            <Receipt className="h-7 w-7" />
          </Link>
          {children}
        </div>
      </main>
      <footer className="pb-8 text-center text-xs text-muted-foreground">
        Billjot · POS, kitchen display and online ordering for Indian restaurants
      </footer>
    </div>
  );
}
