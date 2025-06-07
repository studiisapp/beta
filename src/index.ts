import { betterFetch } from "@better-fetch/fetch";
import { AuthContext, type BetterAuthPlugin, generateId } from "better-auth";
import { createAuthEndpoint, originCheck } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { FieldAttribute, InferFieldsInput, mergeSchema } from "better-auth/db";
import { createAuthMiddleware } from "better-auth/plugins";
import { type ZodRawShape, type ZodTypeAny, z } from "zod";
import { type BetaUser, schema } from "./schema.ts";
import { BetaOptions } from "./types.ts";

export const ERROR_CODES = {
    USER_EXISTS: "User already exists in the beta",
    USER_NOT_FOUND: "User does not have beta access",
    INVALID_CODE: "Invalid or expired beta code",
} as const;

export const betaPlugin = (options?: BetaOptions) => {
    const opts = {
        enabled: options?.enabled ?? false,
        schema: options?.schema,
        sendInviteLink:
            options?.sendInviteLink ??
            ((
                data: { email: string; url: string; code: string },
                request?: Request,
            ): Promise<void> => Promise.resolve()),
        additionalFields: options?.additionalFields ?? {},
    } satisfies BetaOptions;

    const mergedSchema = mergeSchema(schema, opts.schema);
    mergedSchema.beta.fields = {
        ...mergedSchema.beta.fields,
        ...opts.additionalFields,
    };

    type BetaUserModified = BetaUser &
        InferFieldsInput<typeof opts.additionalFields>;

    const model = Object.keys(mergedSchema)[0] as string;

    return {
        id: "betaPlugin",
        schema: mergedSchema,
        $ERROR_CODES: ERROR_CODES,
        hooks: {
            before: [
                {
                    matcher: (context) => {
                        return context.path.startsWith("/sign-up/email");
                    },
                    handler: createAuthMiddleware(async (context) => {
                        const betaEnabled = options?.enabled ?? true;
                        if (betaEnabled) {
                            const secret = context.request?.headers.get("X-Beta-Signup");
                            const expectedSecret = options?.betaSecret ?? "";

                            if (!secret || secret !== expectedSecret) {
                                throw context.error("FORBIDDEN", {
                                    message: "Beta access required",
                                });
                            }
                        }

                        return {
                            context: context,
                        };
                    }),
                },
            ],
        },
        endpoints: {
            addBetaUser: createAuthEndpoint(
                "/beta/add-user",
                {
                    method: "POST",
                    body: convertAdditionalFieldsToZodSchema({
                        email: { type: "string", required: false },
                        goldenTicket: { type: "boolean", required: false },
                        redirectTo: { type: "string", required: false },
                        wildcard: { type: "boolean", required: false },
                    }) as never as z.ZodType<Omit<BetaUser, "id" | "addedAt" | "code">>,
                },
                async (ctx) => {
                    const {
                        email,
                        goldenTicket,
                        redirectTo,
                        wildcard,
                        ...everythingElse
                    } = ctx.body as {
                        email?: string;
                        wildcard?: boolean;
                    } & Record<string, any>;

                    if (!email && !wildcard) {
                        throw ctx.error("FORBIDDEN", {
                            message: "Either email or wildcard must be provided",
                        });
                    }

                    if (email) {
                        const found = await ctx.context.adapter.findOne<BetaUserModified>({
                            model: model,
                            where: [
                                {
                                    field: "email",
                                    value: email,
                                    operator: "eq",
                                },
                            ],
                        });

                        if (found) {
                            throw ctx.error("FORBIDDEN", {
                                message: ERROR_CODES.USER_EXISTS,
                            });
                        }
                    }

                    const betaCode = options?.generateCode
                        ? await options.generateCode(email ?? "")
                        : generateRandomString(32, "a-z", "A-Z");

                    const res = await ctx.context.adapter.create<BetaUserModified>({
                        model: model,
                        data: {
                            ...(email ? { email } : {}),
                            goldenTicket: goldenTicket ?? false,
                            id: generateId(),
                            code: betaCode,
                            wildcard: wildcard ?? false,
                            addedAt: new Date(),
                            ...everythingElse,
                        },
                    });

                    const url = `${ctx.context.baseURL}/beta/sign-up/${betaCode}?callbackURL=${redirectTo}`;

                    if (email && !goldenTicket) {
                        await opts.sendInviteLink({
                            email,
                            url,
                            code: betaCode,
                        });
                    }

                    return ctx.json(res);
                },
            ),
            removeBetaUser: createAuthEndpoint(
                "/beta/remove-user",
                {
                    method: "DELETE",
                    body: convertAdditionalFieldsToZodSchema({
                        email: { type: "string", required: true },
                    }) as never as z.ZodType<Omit<BetaUser, "id" | "addedAt">>,
                },
                async (ctx) => {
                    const { email, redirectTo, ...everythingElse } = ctx.body as {
                        email: string;
                    } & Record<string, any>;

                    const found = await ctx.context.adapter.findOne<BetaUserModified>({
                        model: model,
                        where: [
                            {
                                field: "email",
                                value: email,
                                operator: "eq",
                            },
                        ],
                    });

                    if (!found) {
                        throw ctx.error("FORBIDDEN", {
                            message: ERROR_CODES.USER_NOT_FOUND,
                        });
                    }

                    // TODO: implement this
                    /* const res = await ctx.context.adapter.delete<BetaUserModified>({
                        model: model,
                        where: [{ field: "email", value: email, operator: "eq" }],
                    }); */

                    return ctx.json({ message: "not implemented." });
                },
            ),
            signupBetaUserCallback: createAuthEndpoint(
                "/beta/sign-up/:code",
                {
                    method: "GET",
                    query: z.object({
                        callbackURL: z.string({
                            description:
                                "The URL to redirect the user to sign up to the beta",
                        }),
                    }),
                    use: [originCheck((ctx) => ctx.query.callbackURL)],
                },
                async (ctx) => {
                    const { code } = ctx.params;
                    const { callbackURL } = ctx.query;

                    if (!code || !callbackURL) {
                        throw ctx.redirect(
                            redirectError(ctx.context, callbackURL, {
                                error: "INVALID_TOKEN",
                            }),
                        );
                    }

                    const betaUser = await ctx.context.adapter.findOne<BetaUserModified>({
                        model: model,
                        where: [
                            {
                                field: "code",
                                value: code,
                                operator: "eq",
                            },
                        ],
                    });

                    if (!betaUser) {
                        throw ctx.redirect(
                            redirectError(ctx.context, callbackURL, {
                                error: "INVALID_TOKEN",
                            }),
                        );
                    }

                    throw ctx.redirect(
                        redirectCallback(ctx.context, callbackURL, { code }),
                    );
                },
            ),
            signupBetaUser: createAuthEndpoint(
                "/beta/sign-up",
                {
                    method: "POST",
                    query: z.object({
                        code: z.string().optional(),
                    }),
                    body: z.object({
                        name: z.string(),
                        username: z.string(),
                        email: z.string().email(),
                        code: z.string().optional(),
                        password: z.string().min(8),
                    }),
                },
                async (ctx) => {
                    const code = ctx.body.code || ctx.query?.code;

                    if (!code) {
                        throw ctx.error("FORBIDDEN", { message: ERROR_CODES.INVALID_CODE });
                    }

                    const { name, username, email, password } = ctx.body;

                    let betaUser = await ctx.context.adapter.findOne<BetaUserModified>({
                        model,
                        where: [
                            { field: "email", value: email, operator: "eq" },
                            { field: "code", value: code, operator: "eq" },
                        ],
                    });

                    if (!betaUser) {
                        const wildcardMatch =
                            await ctx.context.adapter.findOne<BetaUserModified>({
                                model,
                                where: [
                                    { field: "code", value: code, operator: "eq" },
                                    { field: "wildcard", value: true, operator: "eq" },
                                ],
                            });

                        if (wildcardMatch) {
                            betaUser = wildcardMatch;
                        }
                    }

                    if (!betaUser) {
                        throw ctx.error("FORBIDDEN", { message: ERROR_CODES.INVALID_CODE });
                    }

                    if (betaUser.wildcard) {
                        await ctx.context.adapter.delete<BetaUserModified>({
                            model,
                            where: [{ field: "code", value: code, operator: "eq" }],
                        });
                    }

                    const res = await betterFetch(
                        ctx.context.baseURL + "/sign-up/email",
                        {
                            method: "POST",
                            body: JSON.stringify({
                                name,
                                username,
                                email,
                                password,
                                isEarlyAccess: true,
                                hasUsedTicket: "",
                            }),
                            headers: {
                                "Content-Type": "application/json",
                                "X-Beta-Signup": options?.betaSecret ?? "",
                            },
                        },
                    );

                    return ctx.json(res);
                },
            ),
            checkBetaCode: createAuthEndpoint(
                "/beta/check",
                {
                    method: "GET",
                    query: z.object({
                        code: z.string(),
                    }),
                },
                async (ctx) => {
                    const { code } = ctx.query;
                    if (!code) {
                        return ctx.json({ status: false });
                    }

                    const betaUser = await ctx.context.adapter.findOne<BetaUserModified>({
                        model,
                        where: [{ field: "code", value: code, operator: "eq" }],
                    });

                    if (!betaUser) {
                        return ctx.json({ status: false });
                    }

                    return ctx.json({
                        status: true,
                        wildcard: betaUser.wildcard ?? false,
                    });
                },
            ),
        },
    } satisfies BetterAuthPlugin;

    function convertAdditionalFieldsToZodSchema(
        additionalFields: Record<string, FieldAttribute>,
    ) {
        const additionalFieldsZodSchema: ZodRawShape = {};
        for (const [key, value] of Object.entries(additionalFields)) {
            let res: ZodTypeAny;

            if (value.type === "string") {
                res = z.string();
            } else if (value.type === "number") {
                res = z.number();
            } else if (value.type === "boolean") {
                res = z.boolean();
            } else if (value.type === "date") {
                res = z.date();
            } else if (value.type === "string[]") {
                res = z.array(z.string());
            } else {
                res = z.array(z.number());
            }

            if (!value.required) {
                res = res.optional();
            }

            additionalFieldsZodSchema[key] = res;
        }
        return z.object(additionalFieldsZodSchema);
    }

    function redirectError(
        ctx: AuthContext,
        callbackURL: string | undefined,
        query?: Record<string, string>,
    ): string {
        const url = callbackURL
            ? new URL(callbackURL, ctx.baseURL)
            : new URL(`${ctx.baseURL}/error`);
        if (query)
            Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
        return url.href;
    }

    function redirectCallback(
        ctx: AuthContext,
        callbackURL: string,
        query?: Record<string, string>,
    ): string {
        const url = new URL(callbackURL, ctx.baseURL);
        if (query)
            Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
        return url.href;
    }
};
