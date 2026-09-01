import type { Decision, Status } from './types.js'
import type { Eligibility } from '@orkestrel/qualifier'

/** Default definition validation policy for `createProgram` / `ProgramManager.add`. */
export const DEFAULT_PROGRAM_VALIDATE = true

/** Every {@link Status} literal — the source the union and its guard derive from. */
export const STATUSES = Object.freeze([
	'ineligible',
	'referral',
	'conditional',
	'unrated',
	'eligible',
] as const)

/** Status tally precedence order — least to most resolved. */
export const STATUS_PRECEDENCE: readonly Status[] = Object.freeze([
	'ineligible',
	'referral',
	'conditional',
	'unrated',
	'eligible',
])

/** The deterministic authority decision for each global eligibility. */
export const ELIGIBILITY_DECISIONS: Readonly<Record<Eligibility, Decision>> = Object.freeze({
	eligible: 'approved',
	ineligible: 'denied',
	referral: 'submitted',
})

/** The reserved working-subject key a batch's aggregate projection is written under. */
export const AGGREGATE_KEY = 'aggregate'

/** The reserved working-subject key the authority's outcome projection is written under. */
export const OUTCOME_KEY = 'outcome'
