import { BetterAuthClientPlugin } from "better-auth";
import { betaPlugin } from "./index.ts";

export const betaPluginClient = () => {
    return {
        id: "betaPlugin",
        $InferServerPlugin: {} as ReturnType<typeof betaPlugin>,
    } satisfies BetterAuthClientPlugin;
};
