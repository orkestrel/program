import type { Decision, ProgramEffect } from './types.js'
import type { Eligibility } from '@orkestrel/qualifier'

/**
 * Names the default definition validation policy, `true`, for `createProgram` /
 * `ProgramManager.add`.
 */
export const DEFAULT_PROGRAM_VALIDATE = true

/**
 * Lists every {@link Status} literal in tally order — the source the union and its
 * guard derive from.
 */
export const STATUSES = Object.freeze([
	'ineligible',
	'referral',
	'incomplete',
	'conditional',
	'unrated',
	'eligible',
] as const)

/** Lists the shape categories no aggregate sum can read a number from. */
export const UNSUMMED_CATEGORIES: readonly string[] = Object.freeze([
	'string',
	'boolean',
	'array',
	'object',
])

/** Lists every {@link Decision} literal, the source the decision shape reads. */
export const DECISIONS: readonly Decision[] = Object.freeze(['approved', 'denied', 'submitted'])

/** Lists every `ProgramEffect` literal, the source the determination shape reads. */
export const PROGRAM_EFFECTS: readonly ProgramEffect[] = Object.freeze(['notice', 'limit'])

/** Maps each global eligibility to its deterministic authority decision. */
export const ELIGIBILITY_DECISIONS: Readonly<Record<Eligibility, Decision>> = Object.freeze({
	eligible: 'approved',
	ineligible: 'denied',
	referral: 'submitted',
})

/**
 * Names the reserved working-subject key a batch's aggregate projection is written
 * under, `'aggregate'`.
 */
export const AGGREGATE_KEY = 'aggregate'

/**
 * Names the reserved working-subject key the authority's outcome projection is
 * written under, `'outcome'`.
 */
export const OUTCOME_KEY = 'outcome'
