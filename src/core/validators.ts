import type { Guard } from '@orkestrel/contract'
import type {
	AggregateGroup,
	AggregateDefinition,
	AggregateResult,
	Decision,
	Determination,
	Notice,
	ProgramDefinition,
	ProgramEffect,
	ProgramResult,
	ProgramValidationResult,
	Status,
	Tally,
} from './types.js'
import {
	arrayOf,
	isBoolean,
	isJSONValue,
	isNumber,
	isString,
	literalOf,
	objectOf,
	recordOf,
	whereOf,
} from '@orkestrel/contract'
import {
	isEligibility,
	isPremise,
	isQualificationDefinition,
	isQualificationResult,
} from '@orkestrel/qualifier'
import { isRatingDefinition, isRatingResult } from '@orkestrel/rater'
import { isFieldPath, isLogicalDefinition } from '@orkestrel/reason'
import { STATUS_PRECEDENCE, STATUSES } from './constants.js'

/**
 * Determine whether a value is a {@link Decision} literal.
 *
 * @param value - The candidate value
 * @returns `true` when `value` is a {@link Decision}
 *
 * @example
 * ```ts
 * import { isDecision } from '@orkestrel/program'
 *
 * isDecision('approved') // true
 * ```
 */
export const isDecision: Guard<Decision> = literalOf('approved', 'denied', 'submitted')

/**
 * Determine whether a value is a {@link Status} literal.
 *
 * @param value - The candidate value
 * @returns `true` when `value` is a {@link Status}
 *
 * @example
 * ```ts
 * import { isStatus } from '@orkestrel/program'
 *
 * isStatus('eligible') // true
 * ```
 */
export const isStatus: Guard<Status> = literalOf(STATUSES)

/**
 * Determine whether a value is a {@link ProgramEffect} literal.
 *
 * @param value - The candidate value
 * @returns `true` when `value` is a {@link ProgramEffect}
 *
 * @example
 * ```ts
 * import { isProgramEffect } from '@orkestrel/program'
 *
 * isProgramEffect('notice') // true
 * ```
 */
export const isProgramEffect: Guard<ProgramEffect> = literalOf('notice', 'limit')

/**
 * Determine whether a value is an exact {@link Notice} record.
 *
 * @param value - The candidate value
 * @returns `true` when `value` is a {@link Notice}
 *
 * @example
 * ```ts
 * import { isNotice } from '@orkestrel/program'
 *
 * isNotice({ id: 'minimum', message: 'Minimum applies' }) // true
 * ```
 */
export function isNotice(value: unknown): value is Notice {
	return recordOf({ id: isString, message: isString, scope: isString }, ['scope'])(value)
}

/**
 * Determine whether a value is an exact {@link AggregateDefinition} record.
 *
 * @param value - The candidate value
 * @returns `true` when `value` is an {@link AggregateDefinition}
 *
 * @example
 * ```ts
 * import { isAggregateDefinition } from '@orkestrel/program'
 *
 * isAggregateDefinition({ fields: ['amount'] }) // true
 * ```
 */
export function isAggregateDefinition(value: unknown): value is AggregateDefinition {
	return recordOf({ fields: arrayOf(isFieldPath), by: isFieldPath, gates: isLogicalDefinition }, [
		'by',
		'gates',
	])(value)
}

/**
 * Determine whether a value is an exact {@link ProgramDefinition} record.
 *
 * @remarks
 * `rating` is optional — an omitted `rating` authors an eligibility-only
 * program (see {@link ProgramDefinition}).
 *
 * @param value - The candidate value
 * @returns `true` when `value` is a {@link ProgramDefinition}
 *
 * @example
 * ```ts
 * import { isProgramDefinition } from '@orkestrel/program'
 *
 * isProgramDefinition({ id: 'p', name: 'P', qualification }) // true
 * ```
 */
export function isProgramDefinition(value: unknown): value is ProgramDefinition {
	return recordOf(
		{
			id: isString,
			name: isString,
			description: isString,
			qualification: isQualificationDefinition,
			rating: isRatingDefinition,
			notices: arrayOf(isNotice),
			authority: isLogicalDefinition,
			aggregate: isAggregateDefinition,
			metadata: isJSONValue,
		},
		['description', 'rating', 'notices', 'authority', 'aggregate', 'metadata'],
	)(value)
}

/**
 * Determine whether a value is an open program sums record.
 *
 * @remarks
 * Every own string-named property is checked, including non-enumerable
 * properties. Inherited and symbol-named members are outside the record this
 * guard certifies. Values remain plain JavaScript numbers, including `NaN` and
 * infinities, because the published contract does not refine them.
 *
 * @param value - The candidate value
 * @returns `true` when every own string-named value is a number
 *
 * @example
 * ```ts
 * import { isProgramSums } from '@orkestrel/program'
 *
 * isProgramSums({ premium: 100 }) // true
 * ```
 */
export function isProgramSums(value: unknown): value is Readonly<Record<string, number>> {
	return whereOf(objectOf({}), (record) =>
		Object.getOwnPropertyNames(record).every((key) => isNumber(Reflect.get(record, key))),
	)(value)
}

/**
 * Determine whether a value is an open result-side {@link Determination}.
 *
 * @remarks
 * Unknown members and class instances are admitted. Arrays are refused.
 * Optional `scope` and `message` members may be absent or `undefined`.
 *
 * @param value - The candidate value
 * @returns `true` when every published determination member conforms
 *
 * @example
 * ```ts
 * import { isDetermination } from '@orkestrel/program'
 *
 * isDetermination({ id: 'audit', effect: 'notice', applied: true, premises: [] }) // true
 * ```
 */
export const isDetermination: Guard<Determination> = objectOf(
	{
		id: isString,
		effect: isProgramEffect,
		applied: isBoolean,
		scope: isString,
		message: isString,
		premises: arrayOf(isPremise),
	},
	['scope', 'message'],
)

/**
 * Determine whether a value is an open result-side {@link AggregateGroup}.
 *
 * @remarks
 * Unknown members and class instances are admitted. Arrays are refused.
 *
 * @param value - The candidate value
 * @returns `true` when every published aggregate-group member conforms
 *
 * @example
 * ```ts
 * import { isAggregateGroup } from '@orkestrel/program'
 *
 * isAggregateGroup({ key: 'east', count: 1, sums: { premium: 100 } }) // true
 * ```
 */
export const isAggregateGroup: Guard<AggregateGroup> = objectOf({
	key: isString,
	count: isNumber,
	sums: isProgramSums,
})

/**
 * Determine whether a value is an open result-side {@link Tally}.
 *
 * @remarks
 * Unknown members and class instances are admitted. Arrays are refused.
 *
 * @param value - The candidate value
 * @returns `true` when every published tally member conforms
 *
 * @example
 * ```ts
 * import { isTally } from '@orkestrel/program'
 *
 * isTally({ count: 1, sums: { premium: 100 } }) // true
 * ```
 */
export const isTally: Guard<Tally> = objectOf({ count: isNumber, sums: isProgramSums })

/**
 * Determine whether a value is a total open status-tally record.
 *
 * @remarks
 * Every {@link Status} in {@link STATUS_PRECEDENCE} is required and checked.
 * Unknown members and class instances are admitted. Arrays are refused.
 *
 * @param value - The candidate value
 * @returns `true` when every required status member is a {@link Tally}
 *
 * @example
 * ```ts
 * import { buildEmptyTallies, isTallies } from '@orkestrel/program'
 *
 * isTallies(buildEmptyTallies([])) // true
 * ```
 */
export function isTallies(value: unknown): value is Readonly<Record<Status, Tally>> {
	return whereOf(objectOf({}), (record) =>
		STATUS_PRECEDENCE.every((status) => isTally(Reflect.get(record, status))),
	)(value)
}

/**
 * Determine whether a value is an open {@link ProgramResult}.
 *
 * @remarks
 * This guard is result-postured for values returned through a borrowed
 * {@link ProgramInterface}. It admits unknown members and class instances while
 * composing qualifier's `isQualificationResult` and rater's `isRatingResult`
 * over their complete nested result closures. Arrays are refused.
 *
 * @param value - The candidate value
 * @returns `true` when every published program-result member conforms
 *
 * @example
 * ```ts
 * import { isProgramResult } from '@orkestrel/program'
 *
 * isProgramResult(program.execute(subject)) // true
 * ```
 */
export const isProgramResult: Guard<ProgramResult> = objectOf(
	{
		id: isString,
		name: isString,
		eligibility: isEligibility,
		status: isStatus,
		decision: isDecision,
		qualification: isQualificationResult,
		rating: isRatingResult,
		determinations: arrayOf(isDetermination),
		success: isBoolean,
		trace: arrayOf(isString),
		errors: arrayOf(isString),
	},
	['decision', 'rating'],
)

/**
 * Determine whether a value is an open {@link AggregateResult}.
 *
 * @remarks
 * This guard is result-postured for values returned through a borrowed
 * {@link ProgramInterface}. It admits unknown members and class instances while
 * checking every nested program result, determination, group, total tally
 * record, and sums record. Arrays are refused.
 *
 * @param value - The candidate value
 * @returns `true` when every published aggregate-result member conforms
 *
 * @example
 * ```ts
 * import { isAggregateResult } from '@orkestrel/program'
 *
 * isAggregateResult(program.execute(subjects)) // true
 * ```
 */
export const isAggregateResult: Guard<AggregateResult> = objectOf({
	id: isString,
	name: isString,
	subjects: arrayOf(isProgramResult),
	determinations: arrayOf(isDetermination),
	groups: arrayOf(isAggregateGroup),
	tallies: isTallies,
	count: isNumber,
	sums: isProgramSums,
	success: isBoolean,
	trace: arrayOf(isString),
	errors: arrayOf(isString),
})

/**
 * Determine whether a value is an open {@link ProgramValidationResult}.
 *
 * @remarks
 * `ProgramValidationResult` is this package's own declared interface, not an
 * alias of reason's validation result. This guard therefore checks the three
 * program-owned members directly so the contracts may evolve independently.
 * Unknown members and class instances are admitted. Arrays are refused.
 *
 * @param value - The candidate value
 * @returns `true` when every published program-validation member conforms
 *
 * @example
 * ```ts
 * import { isProgramValidationResult } from '@orkestrel/program'
 *
 * isProgramValidationResult({ valid: true, errors: [], warnings: [] }) // true
 * ```
 */
export const isProgramValidationResult: Guard<ProgramValidationResult> = objectOf({
	valid: isBoolean,
	errors: arrayOf(isString),
	warnings: arrayOf(isString),
})
