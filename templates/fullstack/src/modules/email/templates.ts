import type { Email } from "./send";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export function verificationEmail(to: string, name: string, url: string): Email {
  return {
    to,
    subject: "Verify your email address",
    text: `Hi ${name},\n\nConfirm your email address by opening this link:\n${url}\n`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Confirm your email address:</p><p><a href="${escapeHtml(url)}">Verify email</a></p>`,
  };
}

export function resetPasswordEmail(to: string, name: string, url: string): Email {
  return {
    to,
    subject: "Reset your password",
    text: `Hi ${name},\n\nReset your password by opening this link (valid for one hour):\n${url}\n\nIf you did not ask for this, ignore this email.\n`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Reset your password (the link is valid for one hour):</p><p><a href="${escapeHtml(url)}">Reset password</a></p><p>If you did not ask for this, ignore this email.</p>`,
  };
}
