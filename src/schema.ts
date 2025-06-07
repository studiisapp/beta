import type { AuthPluginSchema } from "better-auth";

export const schema = {
    beta: {
        fields: {
            email: {
                type: "string",
                required: false,
                input: true,
                unique: true,
            },
            goldenTicket: {
                type: "boolean",
                required: false,
                input: false,
                defaultValue: false,
            },
            code: {
                type: "string",
                required: true,
                input: false,
                unique: true,
            },
            wildcard: {
                type: "boolean",
                required: false,
                input: false,
                defaultValue: false,
            },
            addedAt: {
                type: "date",
                required: true,
                input: false,
                defaultValue: new Date(),
            },
        },
        modelName: "beta",
    },
} satisfies AuthPluginSchema;

export type BetaUser = {
    id: string;
    email?: string;
    goldenTicket?: boolean;
    code: string;
    wildcard?: boolean;
    addedAt: Date;
};
