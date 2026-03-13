import { z } from "zod";

export const pathParamsSchema = z.object({
  partnerId: z.string().min(1),
});

export const rulesetAppendPayloadSchema = z.object({
  partnerId: z.string().min(1),
  rules: z.array(z.record(z.string(), z.unknown())),
});
