import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string().url().optional(),
  PGSSLMODE: z.enum(['disable', 'require']).default('disable'),
  AUTH_SECRET: z.string().min(16).optional(),
})

export const env = envSchema.parse(process.env)
