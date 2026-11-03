// Standardised page header for admin sections. Title, optional description,
// optional actions slot on the right.

import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: Props) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 pb-2">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[34px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-[15px] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
