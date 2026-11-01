import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createRouterClient, type RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn, getGlobalStartContext } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { type Router, router } from "../rpc/router";

const getClient = createIsomorphicFn()
  // SSR calls procedures in-process. The client is shared, so context is a function read per call.
  .server(
    (): RouterClient<Router> =>
      createRouterClient(router, {
        context: () => {
          const scope = getGlobalStartContext();
          if (!scope) throw new Error("request scope missing");
          return { db: scope.db, auth: scope.auth, headers: new Headers(getRequestHeaders()) };
        },
      }),
  )
  .client((): RouterClient<Router> => createORPCClient(new RPCLink({ url: `${window.location.origin}/api/rpc` })));

export const client = getClient();
export const orpc = createTanstackQueryUtils(client);
