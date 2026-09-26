// Why a request was refused, in words the app turns into a message.

import type { Context } from "hono";

export type Problem =
  | "unauthorized"
  | "forbidden"
  | "invalid"
  | "offensive"
  | "taken"
  | "limit"
  | "expired"
  | "implausible"
  | "not-found";

const STATUS = {
  unauthorized: 401,
  forbidden: 403,
  invalid: 400,
  offensive: 400,
  taken: 409,
  limit: 409,
  expired: 410,
  implausible: 422,
  "not-found": 404,
} as const;

export function refuse(c: Context, problem: Problem): Response {
  return c.json({ problem }, STATUS[problem]);
}
