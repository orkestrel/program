import { describe, expect, it } from 'vitest'
import { createProgram } from '@src/core'
import { createQualifier } from '@orkestrel/qualifier'
import { createRater } from '@orkestrel/rater'
import { createLogicalReasoner, createQuantitativeReasoner, createReason } from '@orkestrel/reason'
import {
	batchAggregateProgramDefinition,
	batchSubjects,
	buildAggregateGateProgram,
	buildAuthorityProgram,
	cleanAuthority,
	conditionalAuthority,
	conditionalProgramDefinition,
	conditionalSubject,
	cloneSubject,
	eligibleSubject,
	emptyCollectionsProgramDefinition,
	coastalReferralSubject,
	emptyLinesProgramDefinition,
	frameSubject,
	ineligibleSubject,
	noticeProgramDefinition,
	recordEvents,
	referralProgramDefinition,
	referralSubject,
	scopedProgramDefinition,
	scopedReferralProgramDefinition,
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
})
