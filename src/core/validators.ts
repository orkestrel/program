import type { Guard } from '@orkestrel/contract'
import type {
	AggregateDefinition,
	Decision,
	Notice,
	ProgramDefinition,
	ProgramEffect,
	Status,
} from './types.js'
import { arrayOf, isJSONValue, isRecord, isString, literalOf, recordOf } from '@orkestrel/contract'
import { isQualificationDefinition } from '@orkestrel/qualifier'
import { isRatingDefinition } from '@orkestrel/rater'
import { isFieldPath, isLogicalDefinition } from '@orkestrel/reason'

/** Determine whether a value is a {@link Decision} literal. */
export const isDecision: Guard<Decision> = literalOf('approved', 'denied', 'submitted')

/** Determine whether a value is a {@link Status} literal. */
export const isStatus: Guard<Status> = literalOf(
	'ineligible',
	'referral',
	'conditional',
	'unrated',
	'eligible',
)

/** Determine whether a value is a {@link ProgramEffect} literal. */
export const isProgramEffect: Guard<ProgramEffect> = literalOf('notice', 'limit')

/** Determine whether a value is an exact {@link Notice} record. */
export function isNotice(value: unknown): value is Notice {
	return recordOf({ id: isString, message: isString, scope: isString }, ['scope'])(value)
}

/** Determine whether a value is an exact {@link AggregateDefinition} record. */
export function isAggregateDefinition(value: unknown): value is AggregateDefinition {
	return recordOf({ fields: arrayOf(isFieldPath), by: isFieldPath, gates: isLogicalDefinition }, [
		'by',
		'gates',
	])(value)
}

/** Determine whether a value is an exact {@link ProgramDefinition} record. */
export function isProgramDefinition(value: unknown): value is ProgramDefinition {
	if (!isRecord(value)) return false
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
		['description', 'notices', 'authority', 'aggregate', 'metadata'],
	)(value)
}
