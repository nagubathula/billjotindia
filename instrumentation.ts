import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { captureServerError } = await import("@/lib/monitoring");
    await captureServerError({
      error: err,
      route: context.routePath || request.path || "/",
      method: request.method,
      context: {
        routerKind: context.routerKind,
        routeType: context.routeType,
        renderSource: context.renderSource,
        path: request.path,
      },
    });
  }
};
