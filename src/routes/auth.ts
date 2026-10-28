import { Hono } from "hono"

export const authRoutes = new Hono()

authRoutes.post("/exchange", async (context) => {})
