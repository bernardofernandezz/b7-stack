import { z } from "zod";

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  EMAIL_FROM: z.string().min(1),
  // An empty value (as in .dev.vars.example) means "not configured".
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((value) => value || undefined),
});

export type AppEnv = z.infer<typeof envSchema>;

/** Validates the Worker's vars and secrets. Throws listing every missing or invalid name. */
export function parseEnv(env: unknown): AppEnv {
  const result = envSchema.safeParse(env);
  if (!result.success) throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  return result.data;
}
