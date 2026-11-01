import { Resend } from "resend";
import type { AppEnv } from "../../env";

export type Email = { to: string; subject: string; html: string; text: string };

/** The only caller of the email provider. Uses html/text: Resend's `react` option is Node-only. */
export async function sendEmail(env: Pick<AppEnv, "EMAIL_FROM" | "RESEND_API_KEY">, email: Email): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (import.meta.env.DEV) {
      console.info(
        `[email] RESEND_API_KEY unset, not sent:\n  to: ${email.to}\n  subject: ${email.subject}\n  ${email.text}`,
      );
      return;
    }
    throw new Error("RESEND_API_KEY is not configured");
  }
  const { error } = await new Resend(env.RESEND_API_KEY).emails.send({ from: env.EMAIL_FROM, ...email });
  if (error) throw new Error(`Resend failed (${error.name}): ${error.message}`);
}
