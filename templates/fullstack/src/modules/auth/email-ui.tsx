import { Link } from "@tanstack/react-router";

/** Shown after sign-up, or after a sign-in with an unverified address (Better Auth re-sends the link). */
export function VerifyEmailNotice({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Verify your email</h1>
      <p className="text-sm text-zinc-600">We sent a link to {email}. Open it to finish signing in.</p>
    </div>
  );
}

export function PasswordChangedNotice() {
  return <p className="text-sm text-green-700">Password changed. Sign in with your new password.</p>;
}

export function ForgotPasswordLink() {
  return (
    <Link to="/forgot-password" className="text-sm text-zinc-600 underline">
      Forgot your password?
    </Link>
  );
}
