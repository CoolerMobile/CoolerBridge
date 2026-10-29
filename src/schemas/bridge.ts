import z from "zod"
import { cloudLinks, sessions } from "@/db/schema"

export const completePairingSchema = z.object({
  code: z.string(),
  assertion: z.string(),
})

export type AuthVariables = {
  session: typeof sessions.$inferSelect
  cloudLink: typeof cloudLinks.$inferSelect
}
