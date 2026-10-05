import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  // 32+ random bytes, base64/hex. Generate: openssl rand -base64 48
  JWT_SECRET: z.string().min(43, "JWT_SECRET must be at least 32 random bytes (base64)"),
  OTP_SECRET: z.string().min(32, "OTP_SECRET must be at least 32 characters").optional(),
  APP_URL: z.string().url().optional(),
  GIANTSMS_TOKEN: z.string().optional(),
  GIANTSMS_USERNAME: z.string().optional(),
  GIANTSMS_SECRET: z.string().optional(),
  GIANTSMS_SENDER_ID: z.string().max(11).default("AwoshieSDA"),
  SMS_ALLOWED_PREFIXES: z.string().default("+233"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = process.env.NODE_ENV === "production";

/** SMS one-time codes (phone verification, code sign-in, password reset). Off unless OTP_ENABLED=true. */
export function otpEnabled() {
  return process.env.OTP_ENABLED === "true";
}

export function googleEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
