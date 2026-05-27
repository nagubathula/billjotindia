// Generic layout for signed-in user pages OUTSIDE a restaurant context —
// /dashboard, /brands/*. Has the app-shell navbar (Billjot branding + user
// menu), no cart provider. Restaurant-scoped routes (/r/[slug]/(customer)/*
// and /r/[slug]/admin/*) provide their own layouts on top.

import { AppNavbar } from "@/components/AppNavbar";

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNavbar />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
