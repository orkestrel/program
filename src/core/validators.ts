import type { Guard } from '@orkestrel/contract'
import type {
	AggregateDefinition,
	Decision,
	Notice,
	ProgramDefinition,
	ProgramEffect,
	Status,
} from './types.js'
import { arrayOf, isJSONValue, isString, literalOf, recordOf } from '@orkestrel/contract'
import { isQualificationDefinition } from '@orkestrel/qualifier'
import { isRatingDefinition } from '@orkestrel/rater'
import { isFieldPath, isLogicalDefinition } from '@orkestrel/reason'

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
export const isStatus: Guard<Status> = literalOf(
	'ineligible',
	'referral',
	'conditional',
	'unrated',
	'eligible',
)

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
