import { StripeReturnClient } from "./StripeReturnClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string; ctx?: string }>;
};

export default async function StripeReturnPage(props: Props) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);

  return (
    <StripeReturnClient
      slug={params.slug}
      sessionId={searchParams.session_id ?? null}
      returnCtx={searchParams.ctx ?? "storefront"}
    />
  );
}
