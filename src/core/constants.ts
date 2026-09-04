import type { Decision } from './types.js'
import type { Eligibility } from '@orkestrel/qualifier'

/** Names the default definition validation policy for `createProgram` / `ProgramManager.add`. */
export const DEFAULT_PROGRAM_VALIDATE = true

/** Lists every {@link Status} literal — the source the union and its guard derive from. */
export const STATUSES = Object.freeze([
	'ineligible',
	'referral',
	'conditional',
	'unrated',
	'eligible',
] as const)

/** Maps each global eligibility to its deterministic authority decision. */
export const ELIGIBILITY_DECISIONS: Readonly<Record<Eligibility, Decision>> = Object.freeze({
	eligible: 'approved',
	ineligible: 'denied',
	referral: 'submitted',
})

/** Names the reserved working-subject key a batch's aggregate projection is written under. */
export const AGGREGATE_KEY = 'aggregate'

/** Names the reserved working-subject key the authority's outcome projection is written under. */
export const OUTCOME_KEY = 'outcome'
