import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { Button, TextField } from "../components/ui";
import { authClient } from "../modules/auth/client";

export const Route = createFileRoute("/sign-in")({
  // ?reset=true after a password reset, to confirm it worked.
  validateSearch: z.object({ reset: z.boolean().optional() }),
  component: SignIn,
});

function SignIn() {
  const { reset } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    const { error } =
      mode === "sign-up"
        ? await authClient.signUp.email({ name: String(form.get("name")), email, password, callbackURL: "/" })
        : await authClient.signIn.email({ email, password, callbackURL: "/" });
    setPending(false);
    // Sign-up never starts a session, and an unverified sign-in gets the link again.
    if (mode === "sign-up" || error?.code === "EMAIL_NOT_VERIFIED") return setVerifyEmail(email);
    if (error) return setError(error.message ?? "Something went wrong");
    await router.invalidate();
    await navigate({ to: "/" });
  }

  if (verifyEmail) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Verify your email</h1>
        <p className="text-sm text-zinc-600">We sent a link to {verifyEmail}. Open it to finish signing in.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{mode === "sign-in" ? "Sign in" : "Create an account"}</h1>
      {reset && mode === "sign-in" && (
        <p className="text-sm text-green-700">Password changed. Sign in with your new password.</p>
      )}
      {mode === "sign-up" && <TextField label="Name" name="name" required autoComplete="name" />}
      <TextField label="Email" name="email" type="email" required autoComplete="email" />
      <TextField
        label="Password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={pending}>
        {mode === "sign-in" ? "Sign in" : "Sign up"}
      </Button>
      <button
        type="button"
        className="text-sm text-zinc-600 underline"
        onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
      >
        {mode === "sign-in" ? "No account? Sign up" : "Have an account? Sign in"}
      </button>
      {mode === "sign-in" && (
        <Link to="/forgot-password" className="text-sm text-zinc-600 underline">
          Forgot your password?
        </Link>
      )}
    </form>
  );
}
