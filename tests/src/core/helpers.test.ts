import { describe, expect, it } from 'vitest'
import type { FieldPath } from '@orkestrel/contract'
import { isRecord } from '@orkestrel/contract'
import {
	AGGREGATE_KEY,
	OUTCOME_KEY,
	aggregateDefinition,
	assertProgramDefinition,
	assertProgramSubject,
	buildAggregateProjection,
	buildAggregateRecord,
	buildAggregateResult,
	buildLimits,
	buildNotices,
	buildOutcomeProjection,
	buildProgramResult,
	buildQualificationSubject,
	completeTallies,
	copyJSONValue,
	decideEligibility,
	deriveStatus,
	emptySums,
	emptyTallies,
	findMissingScopes,
	formatGroupKey,
	hasReservedKey,
	selectProgramLines,
	sumFields,
	tallyProgram,
	validateProgramDefinition,
	aggregateGroups,
	aggregateSums,
} from '@src/core'
import { createQualifier } from '@orkestrel/qualifier'
import { createRater } from '@orkestrel/rater'
import { lineDefinition, ratingDefinition } from '@orkestrel/rater'
import {
	createEvaluator,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	logicalDefinition,
	rule,
	atom,
} from '@orkestrel/reason'
import type { QualificationResult } from '@orkestrel/qualifier'
import type { Eligibility } from '@orkestrel/qualifier'
import {
	baseLine,
	cleanAuthority,
	conditionalProgramDefinition,
	conditionalSubject,
	createQuantOnlyEngine,
	eligibilityOnlyConditionalProgramDefinition,
	eligibilityOnlyProgramDefinition,
	emptyLinesProgramDefinition,
	eligibleSubject,
	noticeProgramDefinition,
	standardProgramDefinition,
	standardQualification,
	standardRating,
} from '../../setup.js'
import { noticeDefinition, programDefinition } from '@src/core'
import { qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'

function buildQualification(
	overrides: Partial<QualificationResult> & Pick<QualificationResult, 'eligibility'>,
): QualificationResult {
	return {
		id: 'qualification',
		name: 'Qualification',
		scopes: {},
		findings: [],
		derivations: [],
		success: true,
		trace: [],
		errors: [],
		...overrides,
	}
}

describe('helpers', () => {
	describe('copyJSONValue', () => {
		it('deep-clones nested JSON values', () => {
			const original = { tier: 'gold', nested: { count: 1, tags: ['a'] } }
			const copy = copyJSONValue(original)
			expect(copy).toEqual(original)
			if (isRecord(copy)) {
				const nested = copy.nested
				if (isRecord(nested)) {
					Object.assign(nested, { count: 99 })
				}
			}
			expect(original.nested.count).toBe(1)
		})

		it('preserves an own __proto__ key without touching the clone prototype', () => {
			const original = JSON.parse('{"__proto__": {"x": 1}}')
			const copy = copyJSONValue(original)
			if (!isRecord(copy)) {
				throw new Error('expected a record clone')
			}
			expect(Object.getPrototypeOf(copy)).toBe(Object.prototype)
			expect(Object.hasOwn(copy, '__proto__')).toBe(true)
			const descriptor = Object.getOwnPropertyDescriptor(copy, '__proto__')
			expect(descriptor?.value).toEqual({ x: 1 })
			expect(descriptor?.enumerable).toBe(true)
		})

		it('returns primitives unchanged', () => {
			expect(copyJSONValue('text')).toBe('text')
			expect(copyJSONValue(42)).toBe(42)
			expect(copyJSONValue(null)).toBe(null)
		})
	})

	describe('hasReservedKey', () => {
		it('detects aggregate and outcome keys', () => {
			expect(hasReservedKey({ id: 'x' })).toBe(false)
			expect(hasReservedKey({ id: 'x', [AGGREGATE_KEY]: {} })).toBe(true)
			expect(hasReservedKey({ id: 'x', [OUTCOME_KEY]: {} })).toBe(true)
		})
	})

	describe('assertProgramSubject', () => {
		it('throws MISMATCH for non-records', () => {
			expect(() => assertProgramSubject(null)).toThrow('Program subject must be a record')
			expect(() => assertProgramSubject('subject')).toThrow('Program subject must be a record')
		})

		it('throws RESERVED with the offending key as context', () => {
			let aggregateError: unknown
			try {
				assertProgramSubject({ id: 'x', aggregate: {} })
				expect.unreachable('expected RESERVED')
			} catch (caught) {
				aggregateError = caught
			}
			expect(aggregateError).toMatchObject({ code: 'RESERVED', context: 'aggregate' })

			let outcomeError: unknown
			try {
				assertProgramSubject({ id: 'x', outcome: {} })
				expect.unreachable('expected RESERVED')
			} catch (caught) {
				outcomeError = caught
			}
			expect(outcomeError).toMatchObject({ code: 'RESERVED', context: 'outcome' })
		})
	})

	describe('selectProgramLines', () => {
		it('removes scoped ineligible and referral lines before rating', () => {
			const lines = selectProgramLines(
				[
					{ ...baseLine, id: 'wind' },
					{ ...baseLine, id: 'exWind' },
				],
				{ wind: 'ineligible', exWind: 'eligible' },
			)
			expect(lines.map((line) => line.id)).toEqual(['exWind'])
		})

		it('keeps lines with absent or eligible scopes', () => {
			const lines = selectProgramLines([baseLine], {})
			expect(lines).toHaveLength(1)
		})

		it('does not mutate inputs', () => {
			const authored = [baseLine]
			const scopes: Record<string, Eligibility> = { base: 'ineligible' }
			const selected = selectProgramLines(authored, scopes)
			expect(selected).toHaveLength(0)
			expect(authored).toHaveLength(1)
		})
	})

	describe('deriveStatus', () => {
		it('returns ineligible for global ineligibility', () => {
			expect(
				deriveStatus(standardProgramDefinition, buildQualification({ eligibility: 'ineligible' })),
			).toBe('ineligible')
		})

		it('returns referral for global or scoped referral', () => {
			expect(
				deriveStatus(standardProgramDefinition, buildQualification({ eligibility: 'referral' })),
			).toBe('referral')
			expect(
				deriveStatus(
					standardProgramDefinition,
					buildQualification({ eligibility: 'eligible', scopes: { base: 'referral' } }),
				),
			).toBe('referral')
		})

		it('returns unrated when rating is absent or empty', () => {
			expect(
				deriveStatus(standardProgramDefinition, buildQualification({ eligibility: 'eligible' })),
			).toBe('unrated')
			expect(
				deriveStatus(standardProgramDefinition, buildQualification({ eligibility: 'eligible' }), {
					lines: [],
					success: true,
				}),
			).toBe('unrated')
		})

		it('returns unrated when rating failed', () => {
			expect(
				deriveStatus(standardProgramDefinition, buildQualification({ eligibility: 'eligible' }), {
					lines: [
						{
							id: 'base',
							name: 'Base',
							success: false,
							worksheet: {
								id: 'base-rate',
								name: 'Base rate',
								aggregation: 'sum',
								value: 0,
								groups: [],
								steps: [],
								trace: [],
								errors: ['failed'],
								success: false,
							},
						},
					],
					success: false,
				}),
			).toBe('unrated')
		})

		it('returns conditional for applied conditions or scoped restrictions', () => {
			const qualifier = createQualifier()
			const rater = createRater()
			const qualification = qualifier.qualify(
				conditionalSubject,
				conditionalProgramDefinition.qualification,
			)
			const rating = rater.rate(
				conditionalProgramDefinition.rating?.lines ?? [],
				conditionalSubject,
			)
			expect(deriveStatus(conditionalProgramDefinition, qualification, rating)).toBe('conditional')
			qualifier.destroy()
			rater.destroy()
		})

		it('returns eligible when qualification is clean and rating succeeded', () => {
			const qualifier = createQualifier()
			const rater = createRater()
			const qualification = qualifier.qualify(eligibleSubject, standardQualification)
			const rating = rater.rate([baseLine], eligibleSubject)
			expect(deriveStatus(standardProgramDefinition, qualification, rating)).toBe('eligible')
			qualifier.destroy()
			rater.destroy()
		})

		it('returns eligible (never unrated) for an eligibility-only definition with no rating', () => {
			const qualification = buildQualification({ eligibility: 'eligible' })
			expect(deriveStatus(eligibilityOnlyProgramDefinition, qualification)).toBe('eligible')
		})

		it('returns conditional for an eligibility-only definition with an applied condition', () => {
			const qualifier = createQualifier()
			const qualification = qualifier.qualify(
				conditionalSubject,
				eligibilityOnlyConditionalProgramDefinition.qualification,
			)
			expect(deriveStatus(eligibilityOnlyConditionalProgramDefinition, qualification)).toBe(
				'conditional',
			)
			qualifier.destroy()
		})
	})

	describe('decideEligibility', () => {
		it('maps eligibilities to decisions', () => {
			expect(decideEligibility('eligible')).toBe('approved')
			expect(decideEligibility('ineligible')).toBe('denied')
			expect(decideEligibility('referral')).toBe('submitted')
		})
	})

	describe('buildNotices', () => {
		it('interpolates messages against the original subject', () => {
			const notices = buildNotices([noticeDefinition('rated', 'Program {{id}} executed')], {
				id: 'risk-1',
				licensed: true,
			})
			expect(notices[0]?.effect).toBe('notice')
			expect(notices[0]?.message).toBe('Program risk-1 executed')
		})
	})

	describe('buildOutcomeProjection', () => {
		it('projects eligibility, status, rated flag, total, and scopes', () => {
			const qualifier = createQualifier()
			const qualification = qualifier.qualify(eligibleSubject, standardQualification)
			const rater = createRater()
			const rating = rater.rate([baseLine], eligibleSubject)
			const preliminary = buildProgramResult(
				standardProgramDefinition,
				qualification,
				rating,
				[],
				'eligible',
			)
			const projection = buildOutcomeProjection(preliminary)
			expect(projection.eligibility).toBe('eligible')
			expect(projection.status).toBe('eligible')
			expect(projection.rated).toBe(true)
			expect(projection.total).toBe(100)
			expect(Object.hasOwn(projection, 'total')).toBe(true)
			qualifier.destroy()
			rater.destroy()
		})

		it('omits total when rating is absent', () => {
			const qualification = buildQualification({ eligibility: 'eligible' })
			const preliminary = buildProgramResult(
				standardProgramDefinition,
				qualification,
				undefined,
				[],
				'unrated',
			)
			const projection = buildOutcomeProjection(preliminary)
			expect(projection.rated).toBe(false)
			expect(Object.hasOwn(projection, 'total')).toBe(false)
		})
	})

	describe('buildProgramResult', () => {
		it('omits rating when absent and omits decision without authority', () => {
			const qualification = buildQualification({ eligibility: 'ineligible' })
			const result = buildProgramResult(
				standardProgramDefinition,
				qualification,
				undefined,
				[],
				'ineligible',
			)
			expect(result.rating).toBeUndefined()
			expect(result.decision).toBeUndefined()
		})

		it('includes decision only when authority is clean and status is not unrated', () => {
			const qualification = buildQualification({ eligibility: 'eligible' })
			const authority = logicalDefinition('authority', 'Authority', [
				rule('never', [atom('blocked', 'equals', true)], atom('limited', 'equals', true)),
			])
			const engine = createReason({ reasoners: [createLogicalReasoner()], bail: false })
			const resolved = engine.reason({ outcome: { status: 'eligible' } }, authority)
			if (resolved.reasoning !== 'logical') throw new Error('expected logical authority')
			const rater = createRater()
			const rating = rater.rate([baseLine], eligibleSubject)
			const approved = buildProgramResult(
				standardProgramDefinition,
				qualification,
				rating,
				[],
				'eligible',
				{ authority: resolved },
			)
			expect(approved.decision).toBe('approved')

			const limited = buildProgramResult(
				standardProgramDefinition,
				qualification,
				rating,
				[{ id: 'manual', effect: 'limit', applied: true, premises: [] }],
				'conditional',
				{ authority: resolved },
			)
			expect(limited.decision).toBeUndefined()

			const unrated = buildProgramResult(
				standardProgramDefinition,
				qualification,
				undefined,
				[],
				'unrated',
				{ authority: resolved },
			)
			expect(unrated.decision).toBeUndefined()
			rater.destroy()
			engine.destroy()
		})
	})

	describe('buildQualificationSubject', () => {
		it('returns the original subject when aggregate is absent', () => {
			const subject = { id: 'x' }
			expect(buildQualificationSubject(subject)).toBe(subject)
		})

		it('copies aggregate context onto a private subject copy', () => {
			const subject = { id: 'x', amount: 10 }
			const qualified = buildQualificationSubject(subject, {
				count: 2,
				sums: { amount: 20 },
				group: { key: 'east', count: 1, sums: { amount: 10 } },
			})
			expect(qualified).not.toBe(subject)
			expect(qualified.aggregate).toEqual({
				count: 2,
				sums: { amount: 20 },
				group: { key: 'east', count: 1, sums: { amount: 10 } },
			})
		})
	})

	describe('findMissingScopes', () => {
		it('returns missing ruling and notice scopes', () => {
			const definition = programDefinition(
				'missing',
				'Missing',
				qualificationDefinition('q', 'Q', [], {
					rulings: [rulingDefinition('r', 'p', 'r', 'restriction', { scope: 'ghost' })],
				}),
				standardProgramDefinition.rating,
				{ notices: [noticeDefinition('n', 'N', { scope: 'missing' })] },
			)
			expect([...findMissingScopes(definition)].sort()).toEqual(['ghost', 'missing'].sort())
		})
	})

	describe('assertProgramDefinition', () => {
		it('does not throw for a sound definition', () => {
			expect(() => assertProgramDefinition(standardProgramDefinition)).not.toThrow()
		})

		it('throws MISSING with the exact unknown-scope message', () => {
			const definition = programDefinition(
				'assert-missing',
				'Assert missing',
				qualificationDefinition('q', 'Q', [], {
					rulings: [rulingDefinition('r', 'p', 'r', 'restriction', { scope: 'ghost' })],
				}),
				standardRating,
			)
			expect(() => assertProgramDefinition(definition)).toThrow(
				'Unknown rating line reference: ghost',
			)
		})

		it('throws DUPLICATE naming the duplicate rating-line id', () => {
			const definition = programDefinition(
				'assert-dup-line',
				'Assert dup line',
				qualificationDefinition('q', 'Q', []),
				ratingDefinition('dup-rating', 'Dup rating', [
					lineDefinition('base', 'Base', baseLine.rate),
					lineDefinition('base', 'Base again', baseLine.rate),
				]),
			)
			expect(() => assertProgramDefinition(definition)).toThrow('Duplicate rating line id: base')
		})

		it('throws DUPLICATE naming the duplicate notice id', () => {
			const definition = programDefinition(
				'assert-dup-notice',
				'Assert dup notice',
				qualificationDefinition('q', 'Q', []),
				undefined,
				{
					notices: [noticeDefinition('n', 'First'), noticeDefinition('n', 'Second')],
				},
			)
			expect(() => assertProgramDefinition(definition)).toThrow('Duplicate notice id: n')
		})
	})

	describe('validateProgramDefinition', () => {
		it('warns when a program has no rating lines', () => {
			const qualifier = createQualifier()
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const validation = validateProgramDefinition(emptyLinesProgramDefinition, qualifier, engine)
			expect(validation.warnings).toContain('Program rating has no lines')
			qualifier.destroy()
			engine.destroy()
		})

		it('does not warn about empty lines for an eligibility-only definition', () => {
			const qualifier = createQualifier()
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const validation = validateProgramDefinition(
				eligibilityOnlyProgramDefinition,
				qualifier,
				engine,
			)
			expect(validation.warnings).not.toContain('Program rating has no lines')
			expect(validation.valid).toBe(true)
			qualifier.destroy()
			engine.destroy()
		})

		it('reports empty id and name errors', () => {
			const qualifier = createQualifier()
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const definition = programDefinition('', '', qualificationDefinition('q', 'Q', []))
			const validation = validateProgramDefinition(definition, qualifier, engine)
			expect(validation.errors).toContain('Program id must not be empty')
			expect(validation.errors).toContain('Program name must not be empty')
			qualifier.destroy()
			engine.destroy()
		})

		it('reports a duplicate rating line id', () => {
			const qualifier = createQualifier()
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const definition = programDefinition(
				'dup-line-validate',
				'Dup line validate',
				qualificationDefinition('q', 'Q', []),
				ratingDefinition('dup-rating', 'Dup rating', [
					lineDefinition('base', 'Base', baseLine.rate),
					lineDefinition('base', 'Base again', baseLine.rate),
				]),
			)
			const validation = validateProgramDefinition(definition, qualifier, engine)
			expect(validation.errors).toContain('rating: duplicate line id')
			qualifier.destroy()
			engine.destroy()
		})

		it('reports a duplicate notice id', () => {
			const qualifier = createQualifier()
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const definition = programDefinition(
				'dup-notice-validate',
				'Dup notice validate',
				qualificationDefinition('q', 'Q', []),
				undefined,
				{ notices: [noticeDefinition('n', 'First'), noticeDefinition('n', 'Second')] },
			)
			const validation = validateProgramDefinition(definition, qualifier, engine)
			expect(validation.errors).toContain('Duplicate notice id "n"')
			qualifier.destroy()
			engine.destroy()
		})

		it('reports a missing ruling scope and a missing notice scope', () => {
			const qualifier = createQualifier()
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const definition = programDefinition(
				'missing-scope-validate',
				'Missing scope validate',
				qualificationDefinition('q', 'Q', [], {
					rulings: [rulingDefinition('r', 'p', 'r', 'restriction', { scope: 'ghost' })],
				}),
				undefined,
				{ notices: [noticeDefinition('n', 'N', { scope: 'ghost' })] },
			)
			const validation = validateProgramDefinition(definition, qualifier, engine)
			expect(validation.errors).toContain(
				'Qualification ruling "r" references missing line "ghost"',
			)
			expect(validation.errors).toContain('Notice "n" references missing line "ghost"')
			qualifier.destroy()
			engine.destroy()
		})

		it('errors on a scope present without any authored rating', () => {
			const qualifier = createQualifier()
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const definition = programDefinition(
				'no-rating-scope',
				'No rating scope',
				qualificationDefinition('q', 'Q', [], {
					rulings: [rulingDefinition('r', 'p', 'r', 'restriction', { scope: 'base' })],
				}),
			)
			const validation = validateProgramDefinition(definition, qualifier, engine)
			expect(validation.errors).toContain('Qualification ruling "r" references missing line "base"')
			qualifier.destroy()
			engine.destroy()
		})

		it('reports empty and duplicate aggregate fields, and an empty partition field', () => {
			const qualifier = createQualifier()
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const definition = programDefinition(
				'aggregate-fields',
				'Aggregate fields',
				qualificationDefinition('q', 'Q', []),
				undefined,
				{ aggregate: aggregateDefinition([[], 'amount', 'amount'], { by: [] }) },
			)
			const validation = validateProgramDefinition(definition, qualifier, engine)
			expect(validation.errors).toContain('Aggregate fields must be non-empty')
			expect(validation.errors).toContain('Duplicate aggregate field "amount"')
			expect(validation.errors).toContain('Aggregate partition field must be non-empty')
			qualifier.destroy()
			engine.destroy()
		})

		it('warns when aggregate gates are defined without aggregate fields', () => {
			const qualifier = createQualifier()
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const definition = programDefinition(
				'gates-no-fields',
				'Gates no fields',
				qualificationDefinition('q', 'Q', []),
				undefined,
				{ aggregate: aggregateDefinition([], { gates: cleanAuthority }) },
			)
			const validation = validateProgramDefinition(definition, qualifier, engine)
			expect(validation.warnings).toContain('Aggregate gates are defined without aggregate fields')
			qualifier.destroy()
			engine.destroy()
		})

		it('prefixes nested qualification errors with "qualification: "', () => {
			const qualifier = createQualifier()
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const definition = programDefinition('nested-q', '', qualificationDefinition('', '', []))
			const validation = validateProgramDefinition(definition, qualifier, engine)
			expect(validation.errors.some((error) => error.startsWith('qualification: '))).toBe(true)
			qualifier.destroy()
			engine.destroy()
		})

		it('prefixes a nested authority error with "authority: " (quant-only engine)', () => {
			const qualifier = createQualifier()
			const engine = createQuantOnlyEngine()
			const definition = programDefinition(
				'nested-authority',
				'Nested authority',
				qualificationDefinition('q', 'Q', []),
				undefined,
				{ authority: cleanAuthority },
			)
			const validation = validateProgramDefinition(definition, qualifier, engine)
			expect(validation.errors).toContain(
				'authority: No reasoner registered for reasoning "logical"',
			)
			qualifier.destroy()
			engine.destroy()
		})

		it('prefixes a nested aggregate-gates error with "aggregate: " (quant-only engine)', () => {
			const qualifier = createQualifier()
			const engine = createQuantOnlyEngine()
			const definition = programDefinition(
				'nested-gates',
				'Nested gates',
				qualificationDefinition('q', 'Q', []),
				undefined,
				{ aggregate: aggregateDefinition(['amount'], { gates: cleanAuthority }) },
			)
			const validation = validateProgramDefinition(definition, qualifier, engine)
			expect(validation.errors).toContain(
				'aggregate: No reasoner registered for reasoning "logical"',
			)
			qualifier.destroy()
			engine.destroy()
		})

		it('is valid for an eligibility-only definition with no scopes', () => {
			const qualifier = createQualifier()
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const validation = validateProgramDefinition(
				eligibilityOnlyProgramDefinition,
				qualifier,
				engine,
			)
			expect(validation.valid).toBe(true)
			qualifier.destroy()
			engine.destroy()
		})
	})

	describe('aggregate helpers', () => {
		const subjects = [
			{ id: 'a', amount: 10, location: 'east' },
			{ id: 'b', amount: 20, location: 'west' },
			{ id: 'c', amount: 5, location: 'east' },
		]

		it('sums configured fields without mutating subjects', () => {
			const frozen = subjects.map((subject) => ({ ...subject }))
			const sums = aggregateSums(frozen, ['amount'])
			expect(sums.amount).toBe(35)
			expect(frozen).toEqual(subjects)
		})

		it('partitions groups in first-seen order', () => {
			const groups = aggregateGroups(subjects, ['amount'], 'location')
			expect(groups.map((group) => group.key)).toEqual(['east', 'west'])
			expect(groups[0]?.sums.amount).toBe(15)
		})

		it('builds per-subject aggregate projections', () => {
			const sums = aggregateSums(subjects, ['amount'])
			const groups = aggregateGroups(subjects, ['amount'], 'location')
			const projection = buildAggregateProjection(
				subjects[0] ?? { id: 'a' },
				subjects.length,
				sums,
				groups,
				'location',
			)
			expect(projection.group?.key).toBe('east')
			expect(projection.sums.amount).toBe(35)
		})

		it('builds aggregate gate records', () => {
			const groups = aggregateGroups(subjects, ['amount'], 'location')
			const record = buildAggregateRecord(subjects.length, { amount: 35 }, groups)
			expect(record.aggregate).toEqual({ count: 3, sums: { amount: 35 }, groups })
		})

		it('builds empty sums and complete tallies', () => {
			expect(emptySums(['amount'])).toEqual({ amount: 0 })
			const tallies = emptyTallies(['amount'])
			expect(Object.keys(tallies)).toHaveLength(5)
			expect(tallies.eligible.sums.amount).toBe(0)
		})

		it('completes partial tallies and folds one subject', () => {
			const tallies = completeTallies({ eligible: { count: 1, sums: { amount: 5 } } })
			expect(tallies.referral.count).toBe(0)
			const folded = tallyProgram(
				emptyTallies(['amount']),
				buildProgramResult(
					standardProgramDefinition,
					buildQualification({ eligibility: 'eligible' }),
					undefined,
					[],
					'eligible',
				),
				{ id: 'a', amount: 7 },
				['amount'],
			)
			expect(folded.eligible).toEqual({ count: 1, sums: { amount: 7 } })
		})

		it('assembles aggregate results', () => {
			const qualification = buildQualification({ eligibility: 'eligible' })
			const subjectResult = buildProgramResult(
				standardProgramDefinition,
				qualification,
				undefined,
				[],
				'eligible',
			)
			const aggregate = buildAggregateResult(
				standardProgramDefinition,
				[subjectResult],
				[],
				[],
				emptyTallies(['amount']),
				{ amount: 0 },
			)
			expect(aggregate.count).toBe(1)
			expect(aggregate.subjects[0]?.status).toBe('eligible')
		})

		it('folds a failed gate LogicalResult into a failed AggregateResult', () => {
			const qualification = buildQualification({ eligibility: 'eligible' })
			const subjectResult = buildProgramResult(
				standardProgramDefinition,
				qualification,
				undefined,
				[],
				'eligible',
			)
			const failedGates = {
				reasoning: 'logical' as const,
				conclusion: false,
				rules: [],
				count: 0,
				success: false,
				trace: ['gate trace entry'],
				errors: ['gate error entry'],
			}
			const aggregate = buildAggregateResult(
				standardProgramDefinition,
				[subjectResult],
				[],
				[],
				emptyTallies(['amount']),
				{ amount: 0 },
				{ gates: failedGates },
			)
			expect(aggregate.success).toBe(false)
			expect(aggregate.errors).toContain('gate error entry')
			expect(aggregate.trace).toContain('gate trace entry')
		})
	})

	describe('formatGroupKey', () => {
		it('coerces a resolved field to a string', () => {
			expect(formatGroupKey({ location: 'east' }, 'location')).toBe('east')
			expect(formatGroupKey({ code: 1 }, 'code')).toBe('1')
		})

		it('collapses a missing field and an empty string to the same key', () => {
			expect(formatGroupKey({}, 'location')).toBe('')
			expect(formatGroupKey({ location: '' }, 'location')).toBe('')
		})

		it('collides a numeric value with its string form', () => {
			expect(formatGroupKey({ code: 1 }, 'code')).toBe(formatGroupKey({ code: '1' }, 'code'))
		})
	})

	describe('aggregateGroups collisions', () => {
		it('collapses a missing field and an empty string into one group, first-seen order', () => {
			const subjects = [
				{ id: 'a', amount: 1 },
				{ id: 'b', amount: 2, location: '' },
				{ id: 'c', amount: 3, location: 'east' },
			]
			const groups = aggregateGroups(subjects, ['amount'], 'location')
			expect(groups.map((group) => group.key)).toEqual(['', 'east'])
			expect(groups[0]?.count).toBe(2)
		})

		it('collides numeric and string partition keys', () => {
			const subjects = [
				{ id: 'a', amount: 1, code: 1 },
				{ id: 'b', amount: 2, code: '1' },
			]
			const groups = aggregateGroups(subjects, ['amount'], 'code')
			expect(groups).toHaveLength(1)
			expect(groups[0]?.count).toBe(2)
		})
	})

	describe('sumFields', () => {
		it('returns a fresh record and does not mutate the input', () => {
			const sums = { amount: 3 }
			const next = sumFields(sums, { amount: 4 }, ['amount'])
			expect(next).toEqual({ amount: 7 })
			expect(sums).toEqual({ amount: 3 })
			expect(next).not.toBe(sums)
		})

		it('handles an unseeded key by starting from zero', () => {
			expect(sumFields({}, { amount: 5 }, ['amount'])).toEqual({ amount: 5 })
		})

		it('contributes zero (leaves an unseeded key absent) for NaN, Infinity, -Infinity, strings, and absent values', () => {
			expect(sumFields({}, { amount: Number.NaN }, ['amount'])).toEqual({})
			expect(sumFields({}, { amount: Number.POSITIVE_INFINITY }, ['amount'])).toEqual({})
			expect(sumFields({}, { amount: Number.NEGATIVE_INFINITY }, ['amount'])).toEqual({})
			expect(sumFields({}, { amount: 'text' }, ['amount'])).toEqual({})
			expect(sumFields({}, {}, ['amount'])).toEqual({})
			expect(sumFields({ amount: 3 }, { amount: Number.NaN }, ['amount'])).toEqual({ amount: 3 })
		})
	})

	describe('hostile subjects', () => {
		it('buildQualificationSubject copies an own __proto__/constructor-carrying subject safely', () => {
			const hostile: Record<string, unknown> = JSON.parse('{"id":"h","__proto__":{"x":1}}')
			const qualified = buildQualificationSubject(hostile, { count: 1, sums: {} })
			expect(Object.hasOwn(qualified, AGGREGATE_KEY)).toBe(true)
			expect(Object.getPrototypeOf(qualified)).toBe(Object.prototype)
			const fresh: Record<string, unknown> = {}
			expect(fresh.x).toBeUndefined()
		})

		it('aggregateGroups and formatGroupKey key an own-__proto__ subject as an ordinary record', () => {
			const hostile = JSON.parse('{"id":"h","__proto__":{"location":"nope"},"location":"east"}')
			expect(formatGroupKey(hostile, 'location')).toBe('east')
			const groups = aggregateGroups([hostile], [], 'location')
			expect(groups[0]?.key).toBe('east')
		})
	})

	describe('buildLimits', () => {
		it('emits limit determinations only for applied rules', () => {
			const definition = logicalDefinition('limits', 'Limits', [
				rule('fire', [atom('blocked', 'equals', true)], atom('limited', 'equals', true), {
					description: 'Blocked for {{id}}',
				}),
			])
			const engine = createReason({ reasoners: [createLogicalReasoner()], bail: false })
			const resolved = engine.reason({ id: 'risk-1', blocked: true }, definition)
			if (resolved.reasoning !== 'logical') throw new Error('expected logical result')
			const limits = buildLimits(
				definition,
				resolved,
				{ id: 'risk-1', blocked: true },
				createEvaluator(),
			)
			expect(limits).toHaveLength(1)
			expect(limits[0]?.effect).toBe('limit')
			engine.destroy()
		})

		it('omits message when the applied rule has no description', () => {
			const definition = logicalDefinition('limits-no-description', 'Limits no description', [
				rule('fire', [atom('blocked', 'equals', true)], atom('limited', 'equals', true)),
			])
			const engine = createReason({ reasoners: [createLogicalReasoner()], bail: false })
			const resolved = engine.reason({ blocked: true }, definition)
			if (resolved.reasoning !== 'logical') throw new Error('expected logical result')
			const limits = buildLimits(definition, resolved, { blocked: true }, createEvaluator())
			expect(limits).toHaveLength(1)
			expect(Object.hasOwn(limits[0] ?? {}, 'message')).toBe(false)
			engine.destroy()
		})

		it('returns an empty list when no rule applies', () => {
			const definition = logicalDefinition('limits-never', 'Limits never', [
				rule('fire', [atom('blocked', 'equals', true)], atom('limited', 'equals', true), {
					description: 'Blocked',
				}),
			])
			const engine = createReason({ reasoners: [createLogicalReasoner()], bail: false })
			const resolved = engine.reason({ blocked: false }, definition)
			if (resolved.reasoning !== 'logical') throw new Error('expected logical result')
			const limits = buildLimits(definition, resolved, { blocked: false }, createEvaluator())
			expect(limits).toEqual([])
			engine.destroy()
		})
	})

	describe('buildNotices edges', () => {
		it('interpolates a missing token to an empty string', () => {
			const notices = buildNotices([noticeDefinition('n', 'Value {{missing}}')], { id: 'x' })
			expect(notices[0]?.message).toBe('Value ')
		})

		it('interpolates a nested path token', () => {
			const notices = buildNotices([noticeDefinition('n', 'City {{location.city}}')], {
				id: 'x',
				location: { city: 'NYC' },
			})
			expect(notices[0]?.message).toBe('City NYC')
		})

		it('groups a numeric value with en-US thousands separators', () => {
			const notices = buildNotices([noticeDefinition('n', 'Total {{amount}}')], {
				id: 'x',
				amount: 1234567,
			})
			expect(notices[0]?.message).toBe('Total 1,234,567')
		})
	})

	describe('buildOutcomeProjection edges', () => {
		it('returns scopes that do not alias the source result on mutation', () => {
			const qualification = buildQualification({
				eligibility: 'eligible',
				scopes: { base: 'eligible' },
			})
			const preliminary = buildProgramResult(
				standardProgramDefinition,
				qualification,
				undefined,
				[],
				'eligible',
			)
			const projection = buildOutcomeProjection(preliminary)
			const scopes = projection.scopes
			if (isRecord(scopes)) scopes.base = 'ineligible'
			expect(preliminary.qualification.scopes.base).toBe('eligible')
		})
	})

	describe('integration-shaped helper checks', () => {
		it('derives unrated for zero-line programs via real qualification', () => {
			const qualifier = createQualifier()
			const qualification = qualifier.qualify(
				eligibleSubject,
				emptyLinesProgramDefinition.qualification,
			)
			expect(deriveStatus(emptyLinesProgramDefinition, qualification, undefined)).toBe('unrated')
			qualifier.destroy()
		})

		it('builds notice determinations for notice definitions', () => {
			const notices = buildNotices(noticeProgramDefinition.notices ?? [], eligibleSubject)
			expect(notices[0]?.applied).toBe(true)
		})

		it('derives conditional status from a real conditional program qualification', () => {
			const qualifier = createQualifier()
			const rater = createRater()
			const qualification = qualifier.qualify(
				conditionalSubject,
				conditionalProgramDefinition.qualification,
			)
			const rating = rater.rate(
				conditionalProgramDefinition.rating?.lines ?? [],
				conditionalSubject,
			)
			expect(deriveStatus(conditionalProgramDefinition, qualification, rating)).toBe('conditional')
			qualifier.destroy()
			rater.destroy()
		})
	})

	describe('noticeDefinition', () => {
		it('omits absent optional scope', () => {
			const notice = noticeDefinition('audit', 'Audit')
			expect(notice).toEqual({ id: 'audit', message: 'Audit' })
			expect(Object.hasOwn(notice, 'scope')).toBe(false)
		})

		it('includes scope when provided', () => {
			expect(noticeDefinition('audit', 'Audit', { scope: 'base' }).scope).toBe('base')
		})
	})

	describe('aggregateDefinition', () => {
		it('copies fields and omits absent optional keys', () => {
			const fields: readonly FieldPath[] = ['amount']
			const aggregate = aggregateDefinition(fields)
			expect(aggregate.fields).toEqual(['amount'])
			expect(aggregate.fields).not.toBe(fields)
			expect(Object.hasOwn(aggregate, 'by')).toBe(false)
			expect(Object.hasOwn(aggregate, 'gates')).toBe(false)
		})
	})

	describe('programDefinition', () => {
		it('copies collections and metadata independently', () => {
			const notices = [noticeDefinition('audit', 'Audit')]
			const metadata = { tier: 'gold', nested: { value: 1 } }
			const definition = programDefinition('copy', 'Copy', standardQualification, standardRating, {
				notices,
				metadata,
			})
			notices.push(noticeDefinition('extra', 'Extra'))
			if (
				typeof metadata.nested === 'object' &&
				metadata.nested !== null &&
				!Array.isArray(metadata.nested)
			) {
				metadata.nested.value = 99
			}
			expect(definition.notices).toHaveLength(1)
			expect(definition.metadata).toEqual({ tier: 'gold', nested: { value: 1 } })
		})
	})
})
