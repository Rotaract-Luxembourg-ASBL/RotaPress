import { z } from "zod";

export const profileSchema = z.strictObject({
  displayName: z.string().trim().max(120),
  phone: z
    .string()
    .trim()
    .max(80)
    .regex(/^[+\d().\s-]*$/, "Use a phone number or leave it blank."),
  bio: z.string().trim().max(1000),
  interests: z.string().trim().max(500),
  locale: z.enum(["en", "fr", "lb"]),
});
export const saveProfileSchema = z.strictObject({
  expectedVersion: z.int().nonnegative(),
  profile: profileSchema,
});
export type MemberProfile = z.infer<typeof profileSchema>;
export type AccountWorkspace = {
  email: string;
  authMethod: string;
  version: number;
  profile: MemberProfile;
  responses: {
    id: string;
    title: string;
    receivedAt: string;
    status: string;
  }[];
};
