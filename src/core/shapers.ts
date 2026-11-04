import type { ContractShape } from '@orkestrel/contract'
import {
	arrayShape,
	auditFaultShape,
	booleanShape,
	jsonShape,
	literalShape,
	nullableShape,
	numberShape,
	objectShape,
	optionalShape,
	recordShape,
	shapeShape,
	stringShape,
} from '@orkestrel/contract'
import {
	createQualificationDefinitionShape,
	ELIGIBILITIES,
	premiseShape,
	qualificationResultShape,
} from '@orkestrel/qualifier'
import { ratingDefinitionShape, ratingResultShape } from '@orkestrel/rater'
import { CHECK_STATES, createLogicalDefinitionShape, fieldPathShape } from '@orkestrel/reason'
import { DECISIONS, PROGRAM_EFFECTS, STATUSES } from './constants.js'

// A program definition and result as shapes, so they reach an LLM, a tool, and MCP as JSON Schema.
// A result is shaped in its JSON projection, where a non-finite number is `null`.

/** Describes a `Notice`. */
export const noticeShape: ContractShape = objectShape({
	id: stringShape(),
	message: stringShape(),
	scope: optionalShape(stringShape()),
})

/**
 * Creates the shape of a `ProgramDefinition`.
 *
 * @remarks
 * A function because a logical definition's shape is recursive and costs at import.
 * The nested subject declaration is checked through `shapeShape`.
 *
 * @returns The program definition's shape
 *
 * @example
 * ```ts
 * import { createContract } from '@orkestrel/contract'
 * import { createProgramDefinitionShape } from '@orkestrel/program'
 *
 * createContract(createProgramDefinitionShape()).is({ id: 'p' }) // false
 * ```
 */
export function createProgramDefinitionShape(): ContractShape {
	const logical = createLogicalDefinitionShape()
	return objectShape({
		id: stringShape(),
		name: stringShape(),
		description: optionalShape(stringShape()),
		qualification: createQualificationDefinitionShape(),
		rating: optionalShape(ratingDefinitionShape),
		notices: optionalShape(arrayShape(noticeShape)),
		authority: optionalShape(logical),
		aggregate: optionalShape(
			objectShape({
				fields: arrayShape(fieldPathShape),
				partition: optionalShape(fieldPathShape),
				gates: optionalShape(logical),
			}),
		),
		metadata: optionalShape(jsonShape()),
		shape: optionalShape(shapeShape()),
	})
}

/** Describes a `Determination` in its JSON projection. */
export const determinationShape: ContractShape = objectShape({
	id: stringShape(),
	effect: literalShape(PROGRAM_EFFECTS),
	state: literalShape(CHECK_STATES),
	scope: optionalShape(stringShape()),
	message: optionalShape(stringShape()),
	premises: arrayShape(premiseShape),
})

/** Describes a `ProgramResult` in its JSON projection. */
export const programResultShape: ContractShape = objectShape({
	id: stringShape(),
	name: stringShape(),
	eligibility: literalShape(ELIGIBILITIES),
	status: literalShape(STATUSES),
	decision: optionalShape(literalShape(DECISIONS)),
	qualification: qualificationResultShape,
	rating: optionalShape(ratingResultShape),
	determinations: arrayShape(determinationShape),
	success: booleanShape(),
	trace: arrayShape(stringShape()),
	errors: arrayShape(stringShape()),
	faults: arrayShape(auditFaultShape()),
	repairs: arrayShape(auditFaultShape()),
	defaulted: arrayShape(fieldPathShape),
})

/** Describes a sums record in its JSON projection. */
export const programSumsShape: ContractShape = recordShape(nullableShape(numberShape()))

/** Describes a `Tally` in its JSON projection. */
export const tallyShape: ContractShape = objectShape({
	count: numberShape(),
	sums: programSumsShape,
})

/** Describes an `AggregateResult` in its JSON projection. */
export const aggregateResultShape: ContractShape = objectShape({
	id: stringShape(),
	name: stringShape(),
	subjects: arrayShape(programResultShape),
	determinations: arrayShape(determinationShape),
	groups: arrayShape(
		objectShape({ key: stringShape(), count: numberShape(), sums: programSumsShape }),
	),
	tallies: objectShape(Object.fromEntries(STATUSES.map((status) => [status, tallyShape]))),
	count: numberShape(),
	sums: programSumsShape,
	success: booleanShape(),
	trace: arrayShape(stringShape()),
	errors: arrayShape(stringShape()),
	faults: arrayShape(auditFaultShape()),
	repairs: arrayShape(auditFaultShape()),
	defaulted: arrayShape(fieldPathShape),
})
