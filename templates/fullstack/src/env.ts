import { z } from "zod";

/** An empty value (as in .env.example) means "not configured". */
export const optional = <T extends z.ZodType<string>>(schema: T) =>
  z.preprocess((value) => value || undefined, schema.optional());

const envSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  // #if email
  EMAIL_FROM: z.string().min(1),
  RESEND_API_KEY: optional(z.string()),
  // #endif
  // #if billing
  // Shared with the scheduler service, which calls /api/internal/reconcile daily. Unset: the endpoint refuses.
  CRON_SECRET: optional(z.string().min(32, "CRON_SECRET must be at least 32 characters")),
  // #endif
  // #if billing=stripe
  // Unset in local dev: the app runs, and billing calls fail with "billing is not configured".
  STRIPE_SECRET_KEY: optional(z.string().startsWith("sk_")),
  STRIPE_WEBHOOK_SECRET: optional(z.string().startsWith("whsec_")),
  // The recurring price of the Pro plan (src/modules/billing/plans.ts), from the Stripe dashboard.
  STRIPE_PRICE_PRO: optional(z.string().startsWith("price_")),
  // #endif
});

export type AppEnv = z.infer<typeof envSchema>;

/** Validates the process environment. Throws listing every missing or invalid name. */
export function parseEnv(env: unknown): AppEnv {
  const result = envSchema.safeParse(env);
  if (!result.success) throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  return result.data;
}
