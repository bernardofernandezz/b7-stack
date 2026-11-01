import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "../components/ui";
import { authClient } from "../modules/auth/client";

// The link in the invitation email. Accepting makes the organization the session's active one.
export const Route = createFileRoute("/accept-invitation/$id")({ component: AcceptInvitation });

function AcceptInvitation() {
  const { id } = Route.useParams();
  const { session, queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  if (!session) {
    return (
      <p className="text-zinc-600">
        <Link to="/sign-in" className="underline">
          Sign in or sign up
        </Link>{" "}
        with the invited address, then open the invitation link again.
      </p>
    );
  }

  async function accept() {
    setPending(true);
    const { error } = await authClient.organization.acceptInvitation({ invitationId: id });
    setPending(false);
    if (error) return setError(error.message ?? "This invitation is invalid or has expired");
    queryClient.clear(); // the cached session has the previous organization
    await navigate({ to: "/" });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Join the organization</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={accept} disabled={pending}>
        Accept invitation
      </Button>
    </div>
  );
}
