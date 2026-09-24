import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import {
  APIError,
  addOAuthServerContext,
  createAuthMiddleware,
  getOAuthState,
} from "better-auth/api";
import * as schema from "../../../db/schema/auth";
import { config } from "@/core/config";
import { db } from "@/infrastructure/database/client";
import { mailer } from "@/composition/email";
import {
  googleFlowIsCurrent,
  sessionAuthenticationMethod,
  validateProviderIdentity,
} from "./session_policy";
import { googleAuthStore } from "./google_configuration";
import type { GoogleProviderConfiguration } from "./GoogleAuthStore";
import { DomainError } from "../DomainError";
import {
  sendVerificationEmail,
  withVerificationDelivery,
} from "./verification_delivery";

function createAuth(google: GoogleProviderConfiguration | null) {
  async function currentGoogleFlow() {
    const state = await getOAuthState();
    return googleFlowIsCurrent(google?.version, state, (version) =>
      googleAuthStore.accepts(version),
    );
  }
  return betterAuth({
    appName: "RotaPress",
    baseURL: config.APP_URL,
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.APP_URL],
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    emailAndPassword: { enabled: false },
    socialProviders: google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            accessType: "online",
            prompt: "select_account",
          },
        }
      : {},
    user: {
      validateUserInfo: async ({ user, source }) => {
        const invalid = validateProviderIdentity(user, source);
        if (invalid) return invalid;
        if (source.method === "oauth" && !(await currentGoogleFlow()))
          return {
            error: "GOOGLE_CONFIGURATION_CHANGED",
            errorDescription: "Google settings changed. Start sign-in again.",
          };
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
        requireLocalEmailVerified: true,
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      skipStateCookieCheck: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
      additionalFields: {
        authMethod: { type: "string", input: false, defaultValue: "unknown" },
        authProviderVersion: {
          type: "string",
          input: false,
          returned: false,
          required: false,
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (value, context) => {
            const method = sessionAuthenticationMethod(context);
            if (method === "google" && !(await currentGoogleFlow()))
              throw new APIError("FORBIDDEN", {
                message: "Google settings changed. Start sign-in again.",
              });
            return {
              data: {
                ...value,
                authMethod: method,
                authProviderVersion:
                  method === "google" ? google!.version : null,
              },
            };
          },
          after: async (_value, context) => {
            if (google && sessionAuthenticationMethod(context) === "google")
              await googleAuthStore.markVerified(google.version);
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (
          google &&
          context.path === "/sign-in/social" &&
          context.body?.provider === "google"
        ) {
          await addOAuthServerContext({ googleAuthVersion: google.version });
        }
      }),
    },
    onAPIError: { errorURL: new URL("/sign-in", config.APP_URL).href },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 5 },
        "/sign-in/email-otp": { window: 60, max: 10 },
        "/sign-in/social": { window: 60, max: 10 },
        "/callback/google": { window: 60, max: 20 },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp }) {
          await sendVerificationEmail(() =>
            mailer.sendVerificationCode(email, otp),
          );
        },
      }),
    ],
    logger: { disabled: true },
  });
}

// Session/OTP operations share the same library, adapter, signing key and cookies.
export const auth = createAuth(null);

export async function authenticationHandler(
  request: Request,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/email-otp/send-verification-otp")
    return withVerificationDelivery(() => auth.handler(request));
  if (
    path === "/api/auth/sign-in/social" ||
    path === "/api/auth/callback/google"
  ) {
    const google = await googleAuthStore.runtime();
    if (!google)
      throw new DomainError(
        "GOOGLE_UNCONFIGURED",
        "Google sign-in is unavailable. Use email verification.",
        409,
      );
    // Better Auth resolves provider options only once per instance. A fresh
    // request snapshot avoids stale enablement or credentials across workers.
    return createAuth(google).handler(request);
  }
  return auth.handler(request);
}
