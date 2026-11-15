"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Billjot Global Error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 text-neutral-900 antialiased">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Unexpected application error</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Please refresh or try again in a moment.
          </p>
          {error.digest && (
            <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-1.5 font-mono text-xs text-neutral-600">
              Ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Reload screen
          </button>
        </div>
      </body>
    </html>
  );
}
