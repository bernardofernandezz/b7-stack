import type { Email } from "../email/send";
import { escapeHtml } from "../email/templates";

export function invitationEmail(to: string, organization: string, inviter: string, url: string): Email {
  return {
    to,
    subject: `Join ${organization}`,
    text: `${inviter} invited you to join ${organization}.\n\nSign in or sign up with this address, then accept the invitation:\n${url}\n`,
    html: `<p>${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(organization)}</strong>.</p><p>Sign in or sign up with this address, then <a href="${escapeHtml(url)}">accept the invitation</a>.</p>`,
  };
}
