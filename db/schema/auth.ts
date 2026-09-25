import {
  bigint,
  boolean,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const club = pgSchema("club");
const instant = (name: string) => timestamp(name, { withTimezone: true });

// Better Auth API-key plugin 1.7.5. Tokens are hashed by the library.
export const apikey = club.table(
  "apikey",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").notNull().default("default"),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id").notNull(),
    prefix: text("prefix"),
    key: text("key").notNull().unique(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: instant("last_refill_at"),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window").default(60000),
    rateLimitMax: integer("rate_limit_max").default(120),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: instant("last_request"),
    expiresAt: instant("expires_at"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("apikey_reference_idx").on(table.referenceId),
    index("apikey_config_idx").on(table.configId),
  ],
);

// Better Auth core schema, reviewed against the pinned release's database docs.
export const user = club.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
});

export const session = club.table(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: instant("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
    // Set only in a server-side library session creation hook, never by client input.
    authMethod: text("auth_method").notNull().default("unknown"),
    authProviderVersion: text("auth_provider_version"),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = club.table(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: instant("access_token_expires_at"),
    refreshTokenExpiresAt: instant("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("account_user_idx").on(t.userId),
    uniqueIndex("account_provider_identity_idx").on(t.providerId, t.accountId),
  ],
);

export const verification = club.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: instant("expires_at").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimit = club.table("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
