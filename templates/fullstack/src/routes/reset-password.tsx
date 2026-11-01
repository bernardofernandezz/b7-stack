import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { Button, TextField } from "../components/ui";
import { authClient } from "../modules/auth/client";

// Better Auth redirects here with ?token=… for a valid link, or ?error=INVALID_TOKEN.
export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional(), error: z.string().optional() }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token, error: linkError } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  if (!token || linkError) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Link expired</h1>
        <p className="text-sm text-zinc-600">This reset link is invalid or has expired.</p>
        <Link to="/forgot-password" className="text-sm underline">
          Request a new link
        </Link>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get("password"));
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) return setError(error.message ?? "Something went wrong");
    await navigate({ to: "/sign-in", search: { reset: true } });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <TextField
        label="New password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={pending}>
        Set password
      </Button>
    </form>
  );
}
