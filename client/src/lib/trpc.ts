import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
export const trpc = createTRPCReact<AppRouter>();

/** Response types of every procedure, e.g. `RouterOutputs["wheels"]["bootstrap"]`. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
