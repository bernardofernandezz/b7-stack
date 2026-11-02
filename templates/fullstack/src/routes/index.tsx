// biome-ignore-all assist/source/organizeImports: B7 feature regions
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button, TextField } from "../components/ui";
import { orpc } from "../lib/orpc";
// #if organizations
import { CreateOrganization } from "../modules/organizations/ui";
// #endif

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    let canListNotes = Boolean(context.session);
    // #if organizations
    canListNotes = Boolean(context.session?.organization);
    // #endif
    if (canListNotes) await context.queryClient.ensureQueryData(orpc.notes.list.queryOptions());
  },
  component: Home,
});

function Home() {
  const { session } = Route.useRouteContext();
  if (!session) {
    return (
      <p className="text-zinc-600">
        <Link to="/sign-in" className="underline">
          Sign in
        </Link>{" "}
        to keep notes.
      </p>
    );
  }
  // #if organizations
  if (!session.organization) return <CreateOrganization />;
  // #endif
  return <Notes />;
}

function Notes() {
  const queryClient = useQueryClient();
  const { data: notes } = useSuspenseQuery(orpc.notes.list.queryOptions());
  const [content, setContent] = useState("");
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: orpc.notes.key() });
  const create = useMutation(orpc.notes.create.mutationOptions({ onSuccess }));
  const remove = useMutation(orpc.notes.delete.mutationOptions({ onSuccess }));

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ content }, { onSuccess: () => setContent("") });
  }

  return (
    <section className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="flex-1">
          <TextField
            label="New note"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={500}
            required
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Add
        </Button>
      </form>
      {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
      <ul className="flex flex-col gap-2">
        {notes.map((note) => (
          <li
            key={note.id}
            className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2"
          >
            <span>{note.content}</span>
            <Button variant="ghost" aria-label="Delete note" onClick={() => remove.mutate({ id: note.id })}>
              <Trash2 size={16} />
            </Button>
          </li>
        ))}
        {notes.length === 0 && <li className="text-sm text-zinc-500">No notes yet.</li>}
      </ul>
    </section>
  );
}
