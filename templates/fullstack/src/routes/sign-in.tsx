import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { Button, TextField } from "../components/ui";
import { authClient } from "../modules/auth/client";
// #if email
import { ForgotPasswordLink, PasswordChangedNotice, VerifyEmailNotice } from "../modules/auth/email-ui";
// #endif

export const Route = createFileRoute("/sign-in")({
  // ?reset=true after a password reset, to confirm it worked.
  validateSearch: z.object({ reset: z.boolean().optional() }),
  component: SignIn,
});

function SignIn() {
  // #if email
  const { reset } = Route.useSearch();
  const [verifyEmail, setVerifyEmail] = useState<string>();
  // #endif
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

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
    // #if email
    // Sign-up never starts a session, and an unverified sign-in gets the link again.
    if (mode === "sign-up" || error?.code === "EMAIL_NOT_VERIFIED") return setVerifyEmail(email);
    // #endif
    if (error) return setError(error.message ?? "Something went wrong");
    // The root route caches the signed-out session; clear it before re-running loaders.
    queryClient.clear();
    await router.invalidate();
    await navigate({ to: "/" });
  }

  // #if email
  if (verifyEmail) return <VerifyEmailNotice email={verifyEmail} />;
  // #endif

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{mode === "sign-in" ? "Sign in" : "Create an account"}</h1>
      {/* #if email */}
      {reset && mode === "sign-in" && <PasswordChangedNotice />}
      {/* #endif */}
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
      {/* #if email */}
      {mode === "sign-in" && <ForgotPasswordLink />}
      {/* #endif */}
    </form>
  );
}
