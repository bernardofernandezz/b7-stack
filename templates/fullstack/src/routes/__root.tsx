/// <reference types="vite/client" />
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../components/ui";
import { orpc } from "../lib/orpc";
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
  // Cached (and filled by SSR), so client navigations make no session request. Sign-in and sign-out clear the cache.
  beforeLoad: async ({ context }) => ({
    session: await context.queryClient.ensureQueryData(orpc.session.queryOptions()),
  }),
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
  const { session, queryClient } = Route.useRouteContext();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    // Drops the cached session and the previous user's data.
    queryClient.clear();
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
            {/* #if organizations */}
            {session.organization && (
              <Link to="/organization" className="font-medium underline">
                {session.organization.name}
              </Link>
            )}
            {/* #endif */}
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
