import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button, TextField } from "../components/ui";
import { authClient } from "../modules/auth/client";

export const Route = createFileRoute("/organization")({
  beforeLoad: ({ context }) => {
    if (!context.session?.organization) throw redirect({ to: "/" });
    return { organization: context.session.organization };
  },
  component: OrganizationPage,
});

function OrganizationPage() {
  const { organization } = Route.useRouteContext();
  const queryClient = useQueryClient();
  // Better Auth's own endpoint: it checks membership and returns members and pending invitations.
  const { data } = useQuery({
    queryKey: ["organization", organization.id],
    queryFn: async () => (await authClient.organization.getFullOrganization()).data,
  });
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const canInvite = organization.role === "owner" || organization.role === "admin";

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    const { error } = await authClient.organization.inviteMember({
      email: String(form.get("email")),
      role: form.get("role") === "admin" ? "admin" : "member",
    });
    setPending(false);
    setMessage(error ? (error.message ?? "Something went wrong") : "Invitation sent.");
    if (!error) formElement.reset();
    await queryClient.invalidateQueries({ queryKey: ["organization", organization.id] });
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{organization.name}</h1>
      <div>
        <h2 className="mb-2 text-sm font-medium text-zinc-600">Members</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {data?.members.map((m) => (
            <li key={m.id}>
              {m.user.email} <span className="text-zinc-500">({m.role})</span>
            </li>
          ))}
        </ul>
      </div>
      {data?.invitations.some((i) => i.status === "pending") && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-zinc-600">Pending invitations</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {data?.invitations
              .filter((i) => i.status === "pending")
              .map((i) => (
                <li key={i.id}>{i.email}</li>
              ))}
          </ul>
        </div>
      )}
      {canInvite && (
        <form onSubmit={invite} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-600">Invite a member</h2>
          <TextField label="Invite email" name="email" type="email" required />
          <label className="flex flex-col gap-1 text-sm font-medium">
            Role
            <select name="role" className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          {message && <p className="text-sm text-zinc-600">{message}</p>}
          <Button type="submit" disabled={pending}>
            Send invitation
          </Button>
        </form>
      )}
    </section>
  );
}
