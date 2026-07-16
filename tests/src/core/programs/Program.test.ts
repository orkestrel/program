import { describe, expect, it } from 'vitest'
import { createProgram } from '@src/core'
import { createQualifier } from '@orkestrel/qualifier'
import { createRater } from '@orkestrel/rater'
import { createLogicalReasoner, createQuantitativeReasoner, createReason } from '@orkestrel/reason'
import { STATUS_PRECEDENCE } from '@src/core'
import type { Subject } from '@orkestrel/reason'
import {
	allLinesScopedOutProgramDefinition,
	batchAggregateProgramDefinition,
	batchSubjects,
	brokenAggregateGateProgramDefinition,
	brokenAuthorityProgramDefinition,
	buildAggregateGateProgram,
	buildAuthorityProgram,
	buildEligibilityOnlyNoticeMissingScopeDefinition,
	buildHostileSubject,
	buildLargeBatch,
	cleanAuthority,
	conditionalAuthority,
	conditionalProgramDefinition,
	conditionalSubject,
	cloneSubject,
	createRecorder,
	createRecordingEngine,
	createRecordingRater,
	eligibilityOnlyBatchSubjects,
	eligibilityOnlyConditionalProgramDefinition,
	eligibilityOnlyProgramDefinition,
	eligibilityOnlyReferralProgramDefinition,
	eligibilityOnlyWithAuthorityProgramDefinition,
	eligibleSubject,
	emptyCollectionsProgramDefinition,
	coastalReferralSubject,
	emptyLinesProgramDefinition,
	failedQualificationWithAuthorityProgramDefinition,
	frameSubject,
	ineligibleSubject,
	noticeProgramDefinition,
	recordEvents,
	referralProgramDefinition,
	referralSubject,
	scopedProgramDefinition,
	scopedReferralProgramDefinition,
	sharedIdBatchSubjects,
	standardProgramDefinition,
	unratedAuthority,
} from '../../../setup.js'
import { programDefinition, noticeDefinition } from '@src/core'
import { qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'
import { logicalDefinition, rule, atom } from '@orkestrel/reason'
import { standardQualification, standardRating } from '../../../setup.js'

describe('Program', () => {
	describe('pass pipeline and notices', () => {
		it('emits notice determinations interpolated against the original subject', () => {
			const program = createProgram(noticeProgramDefinition)
			const result = program.execute(eligibleSubject)
			const notice = result.determinations.find((entry) => entry.effect === 'notice')
			expect(notice?.message).toBe('Program risk-eligible executed for true')
			program.destroy()
		})
	})

	describe('determinations and statuses', () => {
		it('covers ineligible, referral, conditional, unrated, and eligible statuses', () => {
			const program = createProgram(standardProgramDefinition)
			expect(program.execute(ineligibleSubject).status).toBe('ineligible')
			program.destroy()

			const referral = createProgram(referralProgramDefinition)
			expect(referral.execute(referralSubject).status).toBe('referral')
			referral.destroy()

			const conditional = createProgram(conditionalProgramDefinition)
			expect(conditional.execute(conditionalSubject).status).toBe('conditional')
			conditional.destroy()

			const emptyLines = createProgram(emptyLinesProgramDefinition)
			const unrated = emptyLines.execute({ id: 'empty' })
			expect(unrated.eligibility).toBe('eligible')
			expect(unrated.status).toBe('unrated')
			expect(unrated.rating).toBeUndefined()
			expect(unrated.success).toBe(true)
			emptyLines.destroy()

			const eligible = createProgram(standardProgramDefinition)
			expect(eligible.execute(eligibleSubject).status).toBe('eligible')
			eligible.destroy()
		})
	})

	describe('authority and totals', () => {
		it('runs authority last and omits decision when a limit applies', () => {
			const program = createProgram(
				programDefinition(
					'authority-conditional',
					'Authority conditional',
					conditionalProgramDefinition.qualification,
					conditionalProgramDefinition.rating,
					{ authority: conditionalAuthority },
				),
			)
			const result = program.execute(conditionalSubject)
			expect(result.status).toBe('conditional')
			expect(result.rating?.total).toBe(100)
			expect(result.determinations.some((entry) => entry.effect === 'limit' && entry.applied)).toBe(
				true,
			)
			expect(result.decision).toBeUndefined()
			program.destroy()
		})

		it('derives a decision when authority is clean', () => {
			const program = createProgram(buildAuthorityProgram(cleanAuthority))
			const result = program.execute(eligibleSubject)
			expect(result.decision).toBe('approved')
			expect(result.determinations.filter((entry) => entry.effect === 'limit')).toHaveLength(0)
			program.destroy()
		})

		it('derives denied and submitted without rating terminal subjects', () => {
			const program = createProgram(buildAuthorityProgram(cleanAuthority))
			const denied = program.execute(ineligibleSubject)
			expect(denied.status).toBe('ineligible')
			expect(denied.rating).toBeUndefined()
			expect(denied.decision).toBe('denied')

			const referralProgram = createProgram(
				programDefinition(
					referralProgramDefinition.id,
					referralProgramDefinition.name,
					referralProgramDefinition.qualification,
					referralProgramDefinition.rating,
					{ authority: cleanAuthority },
				),
			)
			const submitted = referralProgram.execute(referralSubject)
			expect(submitted.status).toBe('referral')
			expect(submitted.rating).toBeUndefined()
			expect(submitted.decision).toBe('submitted')
			program.destroy()
			referralProgram.destroy()
		})

		it('runs authority for unrated outcomes but omits decision', () => {
			const definition = programDefinition(
				emptyLinesProgramDefinition.id,
				emptyLinesProgramDefinition.name,
				emptyLinesProgramDefinition.qualification,
				emptyLinesProgramDefinition.rating,
				{ authority: unratedAuthority },
			)
			const program = createProgram(definition)
			const events = recordEvents(program)
			const result = program.execute({ id: 'unrated-authority' })
			expect(result.status).toBe('unrated')
			expect(result.eligibility).toBe('eligible')
			expect(result.determinations.some((entry) => entry.effect === 'limit' && entry.applied)).toBe(
				true,
			)
			expect(result.decision).toBeUndefined()
			expect(events.names).toContain('determine')
			expect(events.names).not.toContain('decide')
			program.destroy()
		})

		it('approves scoped referral while global eligibility stays eligible', () => {
			const program = createProgram(scopedReferralProgramDefinition)
			const result = program.execute(coastalReferralSubject)
			expect(result.qualification.eligibility).toBe('eligible')
			expect(result.status).toBe('referral')
			expect(result.decision).toBe('approved')
			program.destroy()
		})
	})

	describe('safety and determinism', () => {
		it('throws RESERVED with the offending key as context', () => {
			const program = createProgram(standardProgramDefinition)
			let error: unknown
			try {
				program.execute({ id: 'x', aggregate: {} })
				expect.unreachable('expected RESERVED')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'RESERVED', context: 'aggregate' })
			program.destroy()
		})

		it('throws MISMATCH for a non-record subject', () => {
			const program = createProgram(standardProgramDefinition)
			let error: unknown
			try {
				program.execute('subject')
				expect.unreachable('expected MISMATCH')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'MISMATCH' })
			program.destroy()
		})

		it('throws MISSING at construction for an unknown line reference', () => {
			const definition = programDefinition(
				'missing',
				'Missing',
				qualificationDefinition('q', 'Q', [], {
					rulings: [rulingDefinition('r', 'p', 'r', 'restriction', { scope: 'ghost' })],
				}),
				standardRating,
			)
			const gates = logicalDefinition('p', 'P', [
				rule('r', [atom('id', 'equals', 'x')], atom('blocked', 'equals', true)),
			])
			const withPass = programDefinition(
				'missing',
				'Missing',
				qualificationDefinition('q', 'Q', [gates], { rulings: definition.qualification.rulings }),
				standardRating,
			)
			let error: unknown
			try {
				createProgram(withPass)
				expect.unreachable('expected MISSING')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'MISSING', context: 'missing' })
		})

		it('throws DEFINITION for a malformed definition', () => {
			const definition = programDefinition('', '', standardQualification, standardRating)
			let error: unknown
			try {
				createProgram(definition)
				expect.unreachable('expected DEFINITION')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'DEFINITION' })
		})

		it('is deterministic and leaves the caller subject unmutated', () => {
			const program = createProgram(standardProgramDefinition)
			const subject = cloneSubject(eligibleSubject)
			const first = program.execute(subject)
			const second = program.execute(subject)
			expect(first).toEqual(second)
			expect(subject).toEqual(eligibleSubject)
			program.destroy()
		})

		it('never destroys injected qualifier, rater, or engine', () => {
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const qualifier = createQualifier({ engine })
			const rater = createRater({ engine })
			const program = createProgram(standardProgramDefinition, { qualifier, rater, engine })
			program.destroy()
			expect(qualifier.qualify(eligibleSubject, standardQualification).success).toBe(true)
			expect(rater.rate(standardRating.lines, eligibleSubject).success).toBe(true)
			qualifier.destroy()
			rater.destroy()
			engine.destroy()
		})
	})

	describe('empty collections', () => {
		it('warns and reports unrated for zero rating lines', () => {
			const program = createProgram(emptyLinesProgramDefinition)
			const validation = program.validate()
			expect(validation.warnings).toContain('Program rating has no lines')
			const result = program.execute({ id: 'empty' })
			expect(result.status).toBe('unrated')
			expect(result.rating).toBeUndefined()
			program.destroy()
		})

		it('rates a program with no passes, rulings, notices, or authority', () => {
			const program = createProgram(emptyCollectionsProgramDefinition)
			const result = program.execute({ id: 'bare' })
			expect(result.eligibility).toBe('eligible')
			expect(result.status).toBe('eligible')
			expect(result.rating?.total).toBe(100)
			expect(result.determinations).toHaveLength(0)
			program.destroy()
		})
	})

	describe('conditions remain rateable', () => {
		it('rates every eligible line and reports conditional status', () => {
			const program = createProgram(conditionalProgramDefinition)
			const result = program.execute(conditionalSubject)
			expect(result.rating?.lines).toHaveLength(1)
			expect(result.status).toBe('conditional')
			program.destroy()
		})
	})

	describe('scoped selection', () => {
		it('omits the restricted line before rating', () => {
			const program = createProgram(scopedProgramDefinition)
			const result = program.execute(frameSubject)
			expect(result.rating?.lines.map((line) => line.id)).toEqual(['exWind'])
			expect(result.status).toBe('conditional')
			program.destroy()
		})
	})

	describe('batch aggregates', () => {
		it('computes sums, groups, tallies, gates, order, and zero batches without mutation', () => {
			const program = createProgram(batchAggregateProgramDefinition)
			const subjects = batchSubjects.map((subject) => cloneSubject(subject))
			const result = program.execute(subjects)
			expect(result.count).toBe(3)
			expect(result.sums.amount).toBe(60)
			expect(result.groups.map((group) => group.key)).toEqual(['east', 'west'])
			expect(result.tallies.eligible.count).toBe(2)
			expect(result.tallies.ineligible.count).toBe(1)
			expect(result.subjects.map((entry) => entry.status)).toEqual([
				'eligible',
				'ineligible',
				'eligible',
			])
			expect(subjects).toEqual(batchSubjects)
			program.destroy()

			const gated = createProgram(buildAggregateGateProgram(50))
			const gateResult = gated.execute(batchSubjects)
			expect(gateResult.determinations.filter((entry) => entry.effect === 'limit')).toHaveLength(1)
			gated.destroy()

			const empty = createProgram(batchAggregateProgramDefinition)
			const emptyResult = empty.execute([])
			expect(emptyResult.count).toBe(0)
			expect(emptyResult.tallies.eligible.count).toBe(0)
			expect(emptyResult.tallies.ineligible.count).toBe(0)
			empty.destroy()
		})
	})

	describe('event order', () => {
		it('emits single-subject events in contract order', () => {
			const definition = buildAuthorityProgram(cleanAuthority)
			const withNotice = createProgram(
				programDefinition(
					definition.id,
					definition.name,
					definition.qualification,
					definition.rating,
					{
						authority: definition.authority,
						notices: [noticeDefinition('audit', 'Audit {{id}}')],
					},
				),
			)
			const events = recordEvents(withNotice)
			withNotice.execute(eligibleSubject)
			const names = [...events.names]
			expect(names[0]).toBe('qualify')
			expect(names).toContain('rate')
			const rateIndex = names.indexOf('rate')
			const determineIndex = names.indexOf('determine')
			const decideIndex = names.indexOf('decide')
			const executeIndex = names.lastIndexOf('execute')
			expect(determineIndex).toBeGreaterThan(rateIndex)
			expect(decideIndex).toBeGreaterThan(determineIndex)
			expect(executeIndex).toBe(names.length - 1)
			withNotice.destroy()
		})

		it('emits batch per-subject events before aggregate determinations and aggregate', () => {
			const program = createProgram(buildAggregateGateProgram(50))
			const events = recordEvents(program)
			program.execute(batchSubjects)
			const names = [...events.names]
			const aggregateIndex = names.lastIndexOf('aggregate')
			expect(aggregateIndex).toBe(names.length - 1)

			let cursor = 0
			for (let index = 0; index < batchSubjects.length; index += 1) {
				expect(names[cursor++]).toBe('qualify')
				if (names[cursor] === 'rate') cursor += 1
				while (cursor < names.length && names[cursor] === 'determine') cursor += 1
				expect(names[cursor++]).toBe('execute')
			}
			while (cursor < aggregateIndex) {
				expect(names[cursor++]).toBe('determine')
			}
			expect(names[cursor]).toBe('aggregate')
			program.destroy()
		})
	})

	describe('lifecycle', () => {
		it('throws DESTROYED after destroy', () => {
			const program = createProgram(standardProgramDefinition)
			program.destroy()
			let error: unknown
			try {
				program.execute(eligibleSubject)
				expect.unreachable('expected DESTROYED')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'DESTROYED' })
			program.destroy()
		})

		it('destroy is idempotent', () => {
			const program = createProgram(standardProgramDefinition)
			program.destroy()
			expect(() => program.destroy()).not.toThrow()
		})
	})

	describe('aggregate-gate error propagation', () => {
		it('folds gate engine errors into a failed AggregateResult while every subject succeeds', () => {
			const program = createProgram(brokenAggregateGateProgramDefinition, { validate: false })
			const result = program.execute(batchSubjects)
			expect(result.subjects.every((entry) => entry.success)).toBe(true)
			expect(result.success).toBe(false)
			expect(result.errors.length).toBeGreaterThan(0)
			expect(result.trace.length).toBeGreaterThan(0)
			program.destroy()
		})
	})

	describe('authority error suppression', () => {
		it('suppresses the decision and marks the result failed on a broken authority', () => {
			const program = createProgram(brokenAuthorityProgramDefinition, { validate: false })
			const result = program.execute({ id: 'broken-authority-subject' })
			expect(result.success).toBe(false)
			expect(result.decision).toBeUndefined()
			expect(result.errors.length).toBeGreaterThan(0)
			program.destroy()
		})
	})

	describe('failed-qualification decision suppression', () => {
		it('fails closed to referral with no decision even with a clean authority', () => {
			const program = createProgram(failedQualificationWithAuthorityProgramDefinition)
			const result = program.execute(eligibleSubject)
			expect(result.success).toBe(false)
			expect(result.eligibility).toBe('referral')
			expect(result.status).toBe('referral')
			expect(result.decision).toBeUndefined()
			program.destroy()
		})
	})

	describe('eligibility-only programs', () => {
		it('resolves eligible with no rating and never calls the rater', () => {
			const program = createProgram(eligibilityOnlyProgramDefinition)
			const result = program.execute(eligibleSubject)
			expect(result.status).toBe('eligible')
			expect(result.rating).toBeUndefined()
			program.destroy()
		})

		it('derives approved with a clean authority', () => {
			const program = createProgram(eligibilityOnlyWithAuthorityProgramDefinition)
			const result = program.execute(eligibleSubject)
			expect(result.status).toBe('eligible')
			expect(result.decision).toBe('approved')
			program.destroy()
		})

		it('resolves ineligible and denied', () => {
			const program = createProgram(eligibilityOnlyWithAuthorityProgramDefinition)
			const result = program.execute(ineligibleSubject)
			expect(result.status).toBe('ineligible')
			expect(result.decision).toBe('denied')
			program.destroy()
		})

		it('resolves conditional (and still approves with a clean authority)', () => {
			const program = createProgram(eligibilityOnlyConditionalProgramDefinition)
			const result = program.execute(conditionalSubject)
			expect(result.status).toBe('conditional')
			program.destroy()

			const authorized = createProgram(
				programDefinition(
					eligibilityOnlyConditionalProgramDefinition.id,
					eligibilityOnlyConditionalProgramDefinition.name,
					eligibilityOnlyConditionalProgramDefinition.qualification,
					undefined,
					{ authority: cleanAuthority },
				),
			)
			const approved = authorized.execute(conditionalSubject)
			expect(approved.status).toBe('conditional')
			expect(approved.decision).toBe('approved')
			authorized.destroy()
		})

		it('resolves referral and submitted', () => {
			const program = createProgram(
				programDefinition(
					eligibilityOnlyReferralProgramDefinition.id,
					eligibilityOnlyReferralProgramDefinition.name,
					eligibilityOnlyReferralProgramDefinition.qualification,
					undefined,
					{ authority: cleanAuthority },
				),
			)
			const result = program.execute(referralSubject)
			expect(result.status).toBe('referral')
			expect(result.decision).toBe('submitted')
			program.destroy()
		})

		it('throws MISSING at construction for a notice scoped to a non-existent line', () => {
			let error: unknown
			try {
				createProgram(buildEligibilityOnlyNoticeMissingScopeDefinition())
				expect.unreachable('expected MISSING')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'MISSING' })
		})

		it('never resolves unrated in a batch and never fires rate', () => {
			const program = createProgram(eligibilityOnlyProgramDefinition)
			const events = recordEvents(program)
			const result = program.execute(eligibilityOnlyBatchSubjects)
			expect(result.tallies.unrated.count).toBe(0)
			expect(result.tallies.eligible.count).toBe(1)
			expect(result.tallies.ineligible.count).toBe(1)
			expect(events.names).not.toContain('rate')
			program.destroy()
		})

		it('contrasts with an authored-but-empty rating, which still yields unrated', () => {
			const program = createProgram(emptyLinesProgramDefinition)
			const result = program.execute({ id: 'empty-contrast' })
			expect(result.status).toBe('unrated')
			program.destroy()
		})
	})

	describe('batch rejects before any work', () => {
		it('throws RESERVED before rating or recording any subject', () => {
			const rater = createRecordingRater()
			const program = createProgram(standardProgramDefinition, { rater })
			const events = recordEvents(program)
			let error: unknown
			try {
				program.execute([eligibleSubject, { id: 'x', aggregate: {} }])
				expect.unreachable('expected RESERVED')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'RESERVED' })
			expect(rater.count).toBe(0)
			expect(events.names).toHaveLength(0)
			program.destroy()
			rater.destroy()
		})
	})

	describe('all lines scoped out', () => {
		it('resolves unrated with no rating and never calls the rater', () => {
			const rater = createRecordingRater()
			const program = createProgram(allLinesScopedOutProgramDefinition, { rater })
			const result = program.execute(frameSubject)
			expect(result.status).toBe('unrated')
			expect(result.rating).toBeUndefined()
			expect(rater.count).toBe(0)
			program.destroy()
			rater.destroy()
		})
	})

	describe('listener error isolation', () => {
		it('isolates a throwing qualify listener and still runs a sibling listener', () => {
			const errors = createRecorder<readonly [error: unknown, event: string]>()
			const sibling = createRecorder<readonly []>()
			const program = createProgram(standardProgramDefinition, { error: errors.handler })
			program.emitter.on('qualify', () => {
				throw new Error('listener boom')
			})
			program.emitter.on('qualify', sibling.handler)
			const result = program.execute(eligibleSubject)
			expect(result.status).toBe('eligible')
			expect(errors.count).toBe(1)
			expect(errors.calls[0]?.[1]).toBe('qualify')
			expect(sibling.count).toBe(1)
			program.destroy()
		})
	})

	describe('reentrancy', () => {
		it('completes execute even when an execute listener destroys the program', () => {
			const program = createProgram(standardProgramDefinition)
			const destroyed = createRecorder<readonly []>()
			program.emitter.on('destroy', destroyed.handler)
			program.emitter.on('execute', () => {
				program.destroy()
			})
			const result = program.execute(eligibleSubject)
			expect(result.status).toBe('eligible')
			expect(destroyed.count).toBe(1)
			let error: unknown
			try {
				program.execute(eligibleSubject)
				expect.unreachable('expected DESTROYED')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'DESTROYED' })
		})

		it('supports one re-entrant execute call from within an execute listener', () => {
			const program = createProgram(standardProgramDefinition)
			let reentered = false
			let nestedResult: ReturnType<typeof program.execute> | undefined
			program.emitter.on('execute', (result) => {
				if (!reentered && result.id === standardProgramDefinition.id) {
					reentered = true
					nestedResult = program.execute(ineligibleSubject)
				}
			})
			const outer = program.execute(eligibleSubject)
			expect(outer.status).toBe('eligible')
			expect(nestedResult?.status).toBe('ineligible')
			program.destroy()
		})
	})

	describe('hostile subjects', () => {
		it('executes normally without polluting Object.prototype', () => {
			const hostile = buildHostileSubject()
			expect(Object.hasOwn(hostile, '__proto__')).toBe(true)
			expect(Object.hasOwn(hostile, 'constructor')).toBe(true)
			const program = createProgram(standardProgramDefinition)
			const result = program.execute(hostile)
			expect(result.status).toBe('eligible')
			expect(({} as Record<string, unknown>).polluted).toBeUndefined()
			expect(Object.getPrototypeOf({})).toBe(Object.prototype)
			program.destroy()
		})
	})

	describe('aggregate numeric edges', () => {
		it('treats NaN, Infinity, -Infinity, strings, and absent values as zero contribution', () => {
			const program = createProgram(
				programDefinition(
					'numeric-edges',
					'Numeric edges',
					qualificationDefinition('numeric-edges-qualification', 'Numeric edges qualification', []),
					undefined,
					{
						aggregate: {
							fields: ['amount'],
						},
					},
				),
			)
			const subjects: Subject[] = [
				{ id: 'a', amount: Number.NaN },
				{ id: 'b', amount: Number.POSITIVE_INFINITY },
				{ id: 'c', amount: Number.NEGATIVE_INFINITY },
				{ id: 'd', amount: 'not-a-number' },
				{ id: 'e' },
				{ id: 'f', amount: 10 },
			]
			const result = program.execute(subjects)
			expect(result.sums.amount).toBe(10)
			program.destroy()
		})

		it('sums a nested field path, keyed by its dot-joined name', () => {
			const program = createProgram(
				programDefinition(
					'nested-field',
					'Nested field',
					qualificationDefinition('nested-field-qualification', 'Nested field qualification', []),
					undefined,
					{ aggregate: { fields: [['premium', 'total']] } },
				),
			)
			const subjects: Subject[] = [
				{ id: 'a', premium: { total: 5 } },
				{ id: 'b', premium: { total: 7 } },
			]
			const result = program.execute(subjects)
			expect(result.sums['premium.total']).toBe(12)
			program.destroy()
		})
	})

	describe('group-key semantics', () => {
		it('collapses a missing field and an empty-string field into one group', () => {
			const program = createProgram(
				programDefinition(
					'group-semantics',
					'Group semantics',
					qualificationDefinition(
						'group-semantics-qualification',
						'Group semantics qualification',
						[],
					),
					undefined,
					{ aggregate: { fields: ['amount'], by: 'location' } },
				),
			)
			const subjects: Subject[] = [
				{ id: 'a', amount: 1 },
				{ id: 'b', amount: 2, location: '' },
			]
			const result = program.execute(subjects)
			expect(result.groups).toHaveLength(1)
			expect(result.groups[0]?.count).toBe(2)
			program.destroy()
		})

		it('collides numeric and string partition keys', () => {
			const program = createProgram(
				programDefinition(
					'group-collide',
					'Group collide',
					qualificationDefinition('group-collide-qualification', 'Group collide qualification', []),
					undefined,
					{ aggregate: { fields: ['amount'], by: 'code' } },
				),
			)
			const subjects: Subject[] = [
				{ id: 'a', amount: 1, code: 1 },
				{ id: 'b', amount: 2, code: '1' },
			]
			const result = program.execute(subjects)
			expect(result.groups).toHaveLength(1)
			expect(result.groups[0]?.count).toBe(2)
			program.destroy()
		})
	})

	describe('batch scale and identity', () => {
		it('handles a ~250-subject batch with exact tallies and sums', () => {
			const program = createProgram(batchAggregateProgramDefinition)
			const subjects = buildLargeBatch(250)
			const result = program.execute(subjects)
			expect(result.count).toBe(250)
			const tallyCount = Object.values(result.tallies).reduce(
				(total, tally) => total + tally.count,
				0,
			)
			expect(tallyCount).toBe(250)
			const expectedTotal = subjects.reduce((total, subject) => {
				const amount = subject.amount
				return total + (typeof amount === 'number' ? amount : 0)
			}, 0)
			expect(result.sums.amount).toBe(expectedTotal)
			program.destroy()
		})

		it('carries two subjects sharing the same id as two distinct results', () => {
			const program = createProgram(batchAggregateProgramDefinition)
			const result = program.execute(sharedIdBatchSubjects)
			expect(result.subjects).toHaveLength(2)
			expect(result.subjects.every((entry) => entry.id === 'batch')).toBe(true)
			expect(result.count).toBe(2)
			program.destroy()
		})
	})

	describe('empty batch with gates', () => {
		it('still runs gates against a zero-count batch', () => {
			const gates = logicalDefinition('empty-batch-gates', 'Empty batch gates', [
				rule(
					'empty-cap',
					[atom(['aggregate', 'count'], 'below', 1)],
					atom('limited', 'equals', true),
					{ description: 'Empty batch flagged' },
				),
			])
			const program = createProgram(
				programDefinition(
					'empty-batch',
					'Empty batch',
					qualificationDefinition('empty-batch-qualification', 'Empty batch qualification', []),
					undefined,
					{ aggregate: { fields: ['amount'], gates } },
				),
			)
			const result = program.execute([])
			expect(result.success).toBe(true)
			expect(result.subjects).toHaveLength(0)
			expect(result.count).toBe(0)
			expect(result.determinations.filter((entry) => entry.effect === 'limit')).toHaveLength(1)
			program.destroy()
		})
	})

	describe('tallies shape', () => {
		it('always exposes tallies in STATUS_PRECEDENCE order', () => {
			const program = createProgram(batchAggregateProgramDefinition)
			const result = program.execute(batchSubjects)
			expect(Object.keys(result.tallies)).toEqual([...STATUS_PRECEDENCE])
			program.destroy()
		})
	})

	describe('readonly batch execute', () => {
		it('accepts a readonly Subject[] parameter', () => {
			const program = createProgram(standardProgramDefinition)
			const frozen: readonly Subject[] = Object.freeze([eligibleSubject, ineligibleSubject])
			const result = program.execute(frozen)
			expect(result.count).toBe(2)
			program.destroy()
		})
	})

	describe('construction-failure teardown', () => {
		it('fires destroy once and leaves the injected engine unused and usable', () => {
			const engine = createRecordingEngine()
			const destroyed = createRecorder<readonly []>()
			const definition = programDefinition('', '', standardQualification, standardRating)
			let error: unknown
			try {
				createProgram(definition, { engine, on: { destroy: destroyed.handler } })
				expect.unreachable('expected DEFINITION')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'DEFINITION' })
			expect(destroyed.count).toBe(1)
			expect(engine.destroyCount).toBe(0)
			const qualifier = createQualifier({ engine })
			expect(qualifier.qualify(eligibleSubject, standardQualification).success).toBe(true)
			qualifier.destroy()
			engine.destroy()
		})
	})

	describe('post-destroy accessors', () => {
		it('keeps the emitter reachable after destroy', () => {
			const program = createProgram(standardProgramDefinition)
			program.destroy()
			expect(() => program.emitter).not.toThrow()
		})
	})
})
