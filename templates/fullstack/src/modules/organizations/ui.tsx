import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button, TextField } from "../../components/ui";
import { authClient } from "../auth/client";

/** Turns a name into a URL slug, with a short random suffix so two organizations can share a name. */
const slugify = (name: string) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 6)}`;

/** Shown to a signed-in user without an active organization. Creating one makes it active. */
export function CreateOrganization() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    setPending(true);
    const { error } = await authClient.organization.create({ name, slug: slugify(name) });
    setPending(false);
    if (error) return setError(error.message ?? "Something went wrong");
    queryClient.clear(); // the cached session has no organization yet
    await router.invalidate();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Create your organization</h1>
      <p className="text-sm text-zinc-600">Notes belong to an organization and are shared with its members.</p>
      <TextField label="Organization name" name="name" required maxLength={100} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={pending}>
        Create organization
      </Button>
    </form>
  );
}
