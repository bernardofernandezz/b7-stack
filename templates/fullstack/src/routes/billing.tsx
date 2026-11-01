import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "../components/ui";
import { orpc } from "../lib/orpc";

export const Route = createFileRoute("/billing")({
  // Stripe Checkout returns with ?checkout=success. That alone changes nothing: only the webhook or reconciliation does.
  validateSearch: z.object({ checkout: z.literal("success").optional() }),
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/sign-in" });
  },
  component: Billing,
});

const redirectTo = ({ url }: { url: string }) => window.location.assign(url);

function Billing() {
  const { checkout } = Route.useSearch();
  const { data, error } = useQuery({
    ...orpc.billing.status.queryOptions(),
    // After Checkout, poll until the webhook has recorded the subscription.
    refetchInterval: (query) => (checkout && !query.state.data?.entitlements.length ? 2000 : false),
  });
  const upgrade = useMutation(orpc.billing.checkout.mutationOptions({ onSuccess: redirectTo }));
  const manage = useMutation(orpc.billing.portal.mutationOptions({ onSuccess: redirectTo }));
  const pro = data?.entitlements.includes("unlimited-notes") ?? false;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Billing</h1>
      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {data && (
        <p className="text-sm">
          Plan: <strong>{pro ? "Pro" : "Free"}</strong>
          {data.subscription && <span className="text-zinc-600"> ({data.subscription.status})</span>}
          {data.subscription?.status === "past_due" && (
            <span className="text-amber-700"> Payment failed: update your payment method.</span>
          )}
        </p>
      )}
      {checkout && !pro && <p className="text-sm text-zinc-600">Processing your payment…</p>}
      {!pro && (
        <Button onClick={() => upgrade.mutate({ planId: "pro" })} disabled={upgrade.isPending}>
          Upgrade to Pro
        </Button>
      )}
      {data?.subscription && (
        <Button variant="ghost" onClick={() => manage.mutate({})} disabled={manage.isPending}>
          Manage billing
        </Button>
      )}
      {(upgrade.error ?? manage.error) && (
        <p className="text-sm text-red-600">{(upgrade.error ?? manage.error)?.message}</p>
      )}
    </section>
  );
}
