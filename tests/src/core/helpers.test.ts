import { describe, expect, it } from 'vitest'
import {
	AGGREGATE_KEY,
	OUTCOME_KEY,
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
	hasReservedKey,
	selectProgramLines,
	tallyProgram,
	validateProgramDefinition,
	aggregateGroups,
	aggregateSums,
} from '@src/core'
import { createQualifier } from '@orkestrel/qualifier'
import { createRater } from '@orkestrel/rater'
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
	conditionalProgramDefinition,
	conditionalSubject,
	emptyLinesProgramDefinition,
	eligibleSubject,
	noticeProgramDefinition,
	standardProgramDefinition,
	standardQualification,
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
			if (typeof copy === 'object' && copy !== null && !Array.isArray(copy)) {
				const nested = copy.nested
				if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
					nested.count = 99
				}
			}
			expect(original.nested.count).toBe(1)
		})

		it('preserves an own __proto__ key without touching the clone prototype', () => {
			const original = JSON.parse('{"__proto__": {"x": 1}}')
			const copy = copyJSONValue(original)
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
			expect(deriveStatus(buildQualification({ eligibility: 'ineligible' }))).toBe('ineligible')
		})

		it('returns referral for global or scoped referral', () => {
			expect(deriveStatus(buildQualification({ eligibility: 'referral' }))).toBe('referral')
			expect(
				deriveStatus(buildQualification({ eligibility: 'eligible', scopes: { base: 'referral' } })),
			).toBe('referral')
		})

		it('returns unrated when rating is absent or empty', () => {
			expect(deriveStatus(buildQualification({ eligibility: 'eligible' }))).toBe('unrated')
			expect(
				deriveStatus(buildQualification({ eligibility: 'eligible' }), { lines: [], success: true }),
			).toBe('unrated')
		})

		it('returns unrated when rating failed', () => {
			expect(
				deriveStatus(buildQualification({ eligibility: 'eligible' }), {
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
			const rating = rater.rate(conditionalProgramDefinition.rating.lines, conditionalSubject)
			expect(deriveStatus(qualification, rating)).toBe('conditional')
			qualifier.destroy()
			rater.destroy()
		})

		it('returns eligible when qualification is clean and rating succeeded', () => {
			const qualifier = createQualifier()
			const rater = createRater()
			const qualification = qualifier.qualify(eligibleSubject, standardQualification)
			const rating = rater.rate([baseLine], eligibleSubject)
			expect(deriveStatus(qualification, rating)).toBe('eligible')
			qualifier.destroy()
			rater.destroy()
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
			expect(findMissingScopes(definition).sort()).toEqual(['ghost', 'missing'].sort())
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
	})

	describe('integration-shaped helper checks', () => {
		it('derives unrated for zero-line programs via real qualification', () => {
			const qualifier = createQualifier()
			const qualification = qualifier.qualify(
				eligibleSubject,
				emptyLinesProgramDefinition.qualification,
			)
			expect(deriveStatus(qualification, undefined)).toBe('unrated')
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
			const rating = rater.rate(conditionalProgramDefinition.rating.lines, conditionalSubject)
			expect(deriveStatus(qualification, rating)).toBe('conditional')
			qualifier.destroy()
			rater.destroy()
		})
	})
})
