import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { createFileRoute } from "@tanstack/react-router";
import { createCsrfMiddleware } from "@tanstack/react-start";
import { router } from "../../rpc/router";

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      // Expected client errors (401, 400, 404...) are part of the contract, not faults.
      if (!(error instanceof ORPCError) || error.status >= 500) console.error("[rpc]", error);
    }),
  ],
});

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    middleware: [createCsrfMiddleware()],
    handlers: {
      ANY: async ({ request, context }) => {
        const { response } = await handler.handle(request, {
          prefix: "/api/rpc",
          context: { db: context.db, auth: context.auth, env: context.env, headers: request.headers },
        });
        return response ?? new Response("Not found", { status: 404 });
      },
    },
  },
});
