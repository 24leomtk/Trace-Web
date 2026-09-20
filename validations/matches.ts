import * as z from "zod"

// ---------------------------------------------------------------------------
// N4 case-match workflow validations. Proposing a match needs a substantive
// reason (10–1000 chars — "looks similar" doesn't cut it); review is a
// confirm/exclude decision with an optional note.
// ---------------------------------------------------------------------------

export const matchTypeOptions = ["possible", "confirmed", "excluded"] as const

export const matchDecisionOptions = ["confirmed", "excluded"] as const

export const matchProposeSchema = z.object({
  recordIdA: z.uuid(),
  recordIdB: z.uuid(),
  score: z.number().min(0).max(100).optional(),
  reason: z.string().trim().min(10).max(1000),
})

export type MatchProposeInput = z.output<typeof matchProposeSchema>

export const matchReviewSchema = z.object({
  matchId: z.uuid(),
  decision: z.enum(matchDecisionOptions),
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
})

export type MatchReviewInput = z.output<typeof matchReviewSchema>
