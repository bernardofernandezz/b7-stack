/// <reference types="vite/client" />
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../components/ui";
import { client } from "../lib/orpc";
import { authClient } from "../modules/auth/client";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "B7 Fullstack" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  beforeLoad: async () => ({ session: await client.session() }),
  shellComponent: RootDocument,
  component: RootLayout,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  const { session } = Route.useRouteContext();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    await router.invalidate();
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link to="/" className="font-semibold">
          B7 Fullstack
        </Link>
        {session ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-600">{session.user.email}</span>
            <Button variant="ghost" onClick={signOut} aria-label="Sign out">
              <LogOut size={16} />
            </Button>
          </div>
        ) : (
          <Link to="/sign-in" className="text-sm underline">
            Sign in
          </Link>
        )}
      </header>
      <Outlet />
    </div>
  );
}
