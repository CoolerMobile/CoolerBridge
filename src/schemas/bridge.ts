import z from "zod"

export const completePairingSchema = z.object({
  code: z.string(),
  assertion: z.string(),
})
