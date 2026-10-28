import z from "zod"
import { sessions } from "@/db/schema"

export const completePairingSchema = z.object({
  code: z.string(),
  assertion: z.string(),
})

export type AuthVariables = {
  session: typeof sessions.$inferSelect
}
