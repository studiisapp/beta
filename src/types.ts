import { InferOptionSchema } from "better-auth";
import { FieldAttribute } from "better-auth/db";
import { schema } from "./schema.ts";

interface BetaOptionsBase {
    /**
     * schema for the beta plugin. Use this to rename fields.
     */
    schema?: InferOptionSchema<typeof schema>;
    /**
     * Send invite link implementation.
     */
    sendInviteLink: (
        data: {
            email: string;
            url: string;
            code: string;
        },
        request?: Request,
    ) => Promise<void> | void;
    /**
     * Custom function to generate a beta code.
     */
    generateCode?: (email: string) => Promise<string> | string;
    /**
     * Extend the `beta` schema with additional fields.
     */
    additionalFields?: Record<string, FieldAttribute>;
    /**
     * The beta secret used to authenticate to the /sign-up/email route.
     */
    betaSecret?: string;
}

interface BetaOptionsEnabled extends BetaOptionsBase {
    /**
     * Whether the beta is enabled
     *
     * @default false
     */
    enabled: boolean;
}

export type BetaOptions = BetaOptionsEnabled;
