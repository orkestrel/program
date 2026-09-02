import { describe, expect, it } from 'vitest'
import {
	buildAggregateDefinition,
	buildEmptyTallies,
	buildNotice,
	buildProgramDefinition,
	createProgram,
	isAggregateDefinition,
	isAggregateGroup,
	isAggregateResult,
	isDecision,
	isDetermination,
	isNotice,
	isProgramDefinition,
	isProgramEffect,
	isProgramResult,
	isProgramSums,
	isProgramValidationResult,
	isStatus,
	isTallies,
	isTally,
} from '@src/core'
import {
	baseLine,
	batchAggregateProgramDefinition,
	cleanAuthority,
	createResultClass,
	eligibleSubject,
	standardProgramDefinition,
	standardQualification,
	standardRating,
} from '../../setup.js'
import { createHostileValues } from '@orkestrel/test'
import { qualificationDefinition } from '@orkestrel/qualifier'
import { ratingDefinition } from '@orkestrel/rater'
import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'

describe('validators', () => {
	describe('isDecision', () => {
		it('accepts every decision literal', () => {
			expect(isDecision('approved')).toBe(true)
			expect(isDecision('denied')).toBe(true)
			expect(isDecision('submitted')).toBe(true)
		})

		it('rejects non-decision values', () => {
			expect(isDecision('eligible')).toBe(false)
			expect(isDecision(null)).toBe(false)
			expect(isDecision(1)).toBe(false)
		})

		it('never throws on adversarial input', () => {
			const cycle: Record<string, unknown> = {}
			cycle.self = cycle
			expect(() => isDecision(cycle)).not.toThrow()
			expect(isDecision(cycle)).toBe(false)

			const deep: Record<string, unknown> = { level: 0 }
			let current = deep
			for (let index = 0; index < 200; index += 1) {
				const next: Record<string, unknown> = { level: index }
				current.nested = next
				current = next
			}
			expect(isDecision(deep)).toBe(false)

			const hostile = Object.create({ approved: true })
			expect(isDecision(hostile)).toBe(false)
		})
	})

	describe('isStatus', () => {
		it('accepts every status literal', () => {
			expect(isStatus('ineligible')).toBe(true)
			expect(isStatus('referral')).toBe(true)
			expect(isStatus('conditional')).toBe(true)
			expect(isStatus('unrated')).toBe(true)
			expect(isStatus('eligible')).toBe(true)
		})

		it('rejects non-status values', () => {
			expect(isStatus('approved')).toBe(false)
			expect(isStatus(undefined)).toBe(false)
		})

		it('never throws on adversarial input', () => {
			const cycle: Record<string, unknown> = {}
			cycle.self = cycle
			expect(isStatus(cycle)).toBe(false)
		})
	})

	describe('isProgramEffect', () => {
		it('accepts notice and limit', () => {
			expect(isProgramEffect('notice')).toBe(true)
			expect(isProgramEffect('limit')).toBe(true)
		})

		it('rejects other strings', () => {
			expect(isProgramEffect('condition')).toBe(false)
		})
	})

	describe('isNotice', () => {
		it('accepts a valid notice', () => {
			expect(isNotice(buildNotice('audit', 'Audit trail'))).toBe(true)
			expect(isNotice(buildNotice('scoped', 'Scoped', { scope: 'base' }))).toBe(true)
		})

		it('rejects malformed notices', () => {
			expect(isNotice({ id: 'x' })).toBe(false)
			expect(isNotice({ id: 'x', message: 'y', extra: true })).toBe(false)
		})

		it('never throws on adversarial input', () => {
			const cycle: Record<string, unknown> = { id: 'x', message: 'y' }
			cycle.self = cycle
			expect(isNotice(cycle)).toBe(false)
		})
	})

	describe('isAggregateDefinition', () => {
		it('accepts a valid aggregate definition', () => {
			expect(isAggregateDefinition(buildAggregateDefinition(['amount']))).toBe(true)
			expect(
				isAggregateDefinition(
					buildAggregateDefinition(['amount'], {
						by: 'location',
						gates: createLogicalDefinition('gates', 'Gates', [
							createRule(
								'cap',
								[createAtom('total', 'above', 1)],
								createAtom('limited', 'equals', true),
							),
						]),
					}),
				),
			).toBe(true)
		})

		it('rejects malformed aggregate definitions', () => {
			expect(isAggregateDefinition(null)).toBe(false)
			expect(isAggregateDefinition({ fields: ['amount'], extra: true })).toBe(false)
		})
	})

	describe('isProgramDefinition', () => {
		it('accepts a valid program definition', () => {
			expect(isProgramDefinition(standardProgramDefinition)).toBe(true)
		})

		it('rejects malformed program definitions', () => {
			expect(isProgramDefinition(null)).toBe(false)
			expect(isProgramDefinition({ id: 'x' })).toBe(false)
			expect(
				isProgramDefinition({
					...standardProgramDefinition,
					extra: true,
				}),
			).toBe(false)
		})

		it('never throws on adversarial input', () => {
			const cycle: Record<string, unknown> = {
				id: 'x',
				name: 'y',
				qualification: standardQualification,
				rating: standardRating,
			}
			cycle.self = cycle
			expect(isProgramDefinition(cycle)).toBe(false)

			const hostile = Object.create({ id: 'x', name: 'y' })
			expect(isProgramDefinition(hostile)).toBe(false)

			const deep: Record<string, unknown> = {
				id: 'x',
				name: 'y',
				qualification: standardQualification,
				rating: standardRating,
			}
			let current = deep
			for (let index = 0; index < 200; index += 1) {
				const next: Record<string, unknown> = {}
				current.nested = next
				current = next
			}
			expect(isProgramDefinition(deep)).toBe(false)
		})

		it('rejects unknown line references at the guard level only structurally', () => {
			const definition = buildProgramDefinition(
				'scope-test',
				'Scope test',
				standardQualification,
				standardRating,
				{ notices: [buildNotice('missing', 'Missing', { scope: 'missing-line' })] },
			)
			expect(isProgramDefinition(definition)).toBe(true)
			expect(definition.notices?.[0]?.scope).toBe('missing-line')
			expect(baseLine.id).toBe('base')
		})
	})

	describe('isProgramSums', () => {
		it('accepts open own-number records without refining JavaScript numbers', () => {
			expect(
				isProgramSums({ premium: 100, loss: Number.NaN, limit: Number.POSITIVE_INFINITY }),
			).toBe(true)
			expect(isProgramSums({})).toBe(true)
			// Vacuously accepted, and pinned as such: a class instance carries its members on
			// the prototype, so it has no own string-named properties and ZERO values are
			// checked — the dictionary leaf certifies own members only.
			expect(isProgramSums(createResultClass({ premium: 100 }))).toBe(true)
		})

		it('checks non-enumerable own names and ignores inherited and symbol members', () => {
			const valid = Object.create({ inherited: 'ignored' })
			Object.defineProperty(valid, 'hidden', { value: 1 })
			Object.defineProperty(valid, Symbol('ignored'), { value: 'ignored' })
			expect(isProgramSums(valid)).toBe(true)

			const invalid = {}
			Object.defineProperty(invalid, 'hidden', { value: '1' })
			expect(isProgramSums(invalid)).toBe(false)
		})

		it('refuses arrays and wrong own values', () => {
			expect(isProgramSums([])).toBe(false)
			expect(isProgramSums({ premium: '100' })).toBe(false)
		})

		it('is total over the hostile-value set with explicit membership', () => {
			for (const [index, value] of createHostileValues().entries()) {
				let accepted: boolean | undefined
				expect(() => {
					accepted = isProgramSums(value)
				}, `hostile value ${index}`).not.toThrow()
				const expected = index === 2 || index === 4 || index === 5
				expect(accepted, `hostile value ${index}`).toBe(expected)
			}
		})
	})

	describe('isDetermination', () => {
		it('accepts open records, class instances, and optional members', () => {
			const determination = {
				id: 'audit',
				effect: 'notice',
				applied: true,
				premises: [],
				extra: true,
			}
			expect(isDetermination(determination)).toBe(true)
			expect(isDetermination(createResultClass(determination))).toBe(true)
			expect(isDetermination({ ...determination, scope: undefined, message: undefined })).toBe(true)
			expect(isDetermination({ ...determination, scope: 'base', message: 'Applied' })).toBe(true)
		})

		it('refuses every malformed member and arrays', () => {
			const determination = {
				id: 'audit',
				effect: 'notice',
				applied: true,
				premises: [],
			}
			expect(isDetermination({ ...determination, id: 1 })).toBe(false)
			expect(isDetermination({ ...determination, effect: 'condition' })).toBe(false)
			expect(isDetermination({ ...determination, applied: 'yes' })).toBe(false)
			expect(isDetermination({ ...determination, scope: 1 })).toBe(false)
			expect(isDetermination({ ...determination, message: 1 })).toBe(false)
			expect(isDetermination({ ...determination, premises: [{ met: 'yes' }] })).toBe(false)
			expect(isDetermination([])).toBe(false)
		})

		it('refuses an authored Notice outside the determination family', () => {
			expect(isDetermination(buildNotice('audit', 'Audit'))).toBe(false)
		})

		it('refuses every hostile value without throwing', () => {
			for (const [index, value] of createHostileValues().entries()) {
				let accepted: boolean | undefined
				expect(() => {
					accepted = isDetermination(value)
				}, `hostile value ${index}`).not.toThrow()
				expect(accepted, `hostile value ${index}`).toBe(false)
			}
		})
	})

	describe('isAggregateGroup', () => {
		it('accepts open records and class instances', () => {
			const group = { key: 'east', count: 1, sums: { premium: 100 }, extra: true }
			expect(isAggregateGroup(group)).toBe(true)
			expect(isAggregateGroup(createResultClass(group))).toBe(true)
			expect(isAggregateGroup({ ...group, count: Number.NaN })).toBe(true)
		})

		it('refuses malformed members and a tally because group membership requires key', () => {
			const group = { key: 'east', count: 1, sums: { premium: 100 } }
			expect(isAggregateGroup({ ...group, key: 1 })).toBe(false)
			expect(isAggregateGroup({ ...group, count: '1' })).toBe(false)
			expect(isAggregateGroup({ ...group, sums: { premium: '100' } })).toBe(false)
			expect(isAggregateGroup([])).toBe(false)
			expect(isAggregateGroup({ count: 1, sums: {} })).toBe(false)
		})

		it('refuses every hostile value without throwing', () => {
			for (const [index, value] of createHostileValues().entries()) {
				let accepted: boolean | undefined
				expect(() => {
					accepted = isAggregateGroup(value)
				}, `hostile value ${index}`).not.toThrow()
				expect(accepted, `hostile value ${index}`).toBe(false)
			}
		})
	})

	describe('isTally', () => {
		it('accepts open records and class instances', () => {
			const tally = { count: 1, sums: { premium: 100 }, extra: true }
			expect(isTally(tally)).toBe(true)
			expect(isTally(createResultClass(tally))).toBe(true)
			expect(isTally({ ...tally, count: Number.NEGATIVE_INFINITY })).toBe(true)
		})

		it('admits structural group overlap and refuses malformed tally members', () => {
			const tally = { count: 1, sums: { premium: 100 } }
			expect(isTally({ ...tally, count: '1' })).toBe(false)
			expect(isTally({ ...tally, sums: { premium: '100' } })).toBe(false)
			expect(isTally([])).toBe(false)
			expect(isTally({ key: 'east', count: 1, sums: {} })).toBe(true)
			expect(isTally({ id: 'audit', effect: 'notice', applied: true, premises: [] })).toBe(false)
		})

		it('refuses every hostile value without throwing', () => {
			for (const [index, value] of createHostileValues().entries()) {
				let accepted: boolean | undefined
				expect(() => {
					accepted = isTally(value)
				}, `hostile value ${index}`).not.toThrow()
				expect(accepted, `hostile value ${index}`).toBe(false)
			}
		})
	})

	describe('isTallies', () => {
		it('requires every status while admitting unknown members and class instances', () => {
			const tallies = buildEmptyTallies([])
			expect(isTallies(tallies)).toBe(true)
			expect(isTallies({ ...tallies, future: { count: 1, sums: {} } })).toBe(true)
			expect(isTallies(createResultClass(tallies))).toBe(true)

			const { eligible: _eligible, ...incomplete } = tallies
			expect(isTallies(incomplete)).toBe(false)
		})

		it('refuses malformed tallies and sums records outside total-status membership', () => {
			const tallies = buildEmptyTallies([])
			expect(isTallies({ ...tallies, referral: { count: '0', sums: {} } })).toBe(false)
			expect(isTallies([])).toBe(false)
			expect(isTallies({ premium: 100 })).toBe(false)
		})

		it('refuses every hostile value without throwing', () => {
			for (const [index, value] of createHostileValues().entries()) {
				let accepted: boolean | undefined
				expect(() => {
					accepted = isTallies(value)
				}, `hostile value ${index}`).not.toThrow()
				expect(accepted, `hostile value ${index}`).toBe(false)
			}
		})
	})

	describe('isProgramResult', () => {
		it('accepts a populated real-engine result, unknown members, and a class instance', () => {
			const definition = buildProgramDefinition(
				'guarded',
				'Guarded program',
				standardQualification,
				standardRating,
				{
					notices: [buildNotice('audit', 'Audit')],
					authority: cleanAuthority,
				},
			)
			const program = createProgram(definition)
			const result = program.execute(eligibleSubject)
			expect(result.rating?.lines.length).toBeGreaterThan(0)
			expect(result.determinations).toHaveLength(1)
			expect(result.decision).toBe('approved')
			expect(isProgramResult(result)).toBe(true)
			expect(isProgramResult({ ...result, extra: true })).toBe(true)
			expect(isProgramResult(createResultClass(result))).toBe(true)
			program.destroy()
		})

		it('accepts absent-or-undefined optionals and refuses every malformed member', () => {
			const program = createProgram(standardProgramDefinition)
			const result = program.execute(eligibleSubject)
			expect(isProgramResult({ ...result, decision: undefined, rating: undefined })).toBe(true)
			expect(isProgramResult({ ...result, id: 1 })).toBe(false)
			expect(isProgramResult({ ...result, name: 1 })).toBe(false)
			expect(isProgramResult({ ...result, eligibility: 'approved' })).toBe(false)
			expect(isProgramResult({ ...result, status: 'approved' })).toBe(false)
			expect(isProgramResult({ ...result, decision: 'eligible' })).toBe(false)
			expect(isProgramResult({ ...result, qualification: {} })).toBe(false)
			expect(isProgramResult({ ...result, rating: {} })).toBe(false)
			expect(isProgramResult({ ...result, determinations: [{}] })).toBe(false)
			expect(isProgramResult({ ...result, success: 'yes' })).toBe(false)
			expect(isProgramResult({ ...result, trace: [1] })).toBe(false)
			expect(isProgramResult({ ...result, errors: [1] })).toBe(false)
			expect(isProgramResult([])).toBe(false)
			program.destroy()
		})

		it('refuses an AggregateResult outside single-result membership', () => {
			const program = createProgram(batchAggregateProgramDefinition)
			expect(isProgramResult(program.execute([eligibleSubject]))).toBe(false)
			program.destroy()
		})

		it('refuses every hostile value without throwing', () => {
			for (const [index, value] of createHostileValues().entries()) {
				let accepted: boolean | undefined
				expect(() => {
					accepted = isProgramResult(value)
				}, `hostile value ${index}`).not.toThrow()
				expect(accepted, `hostile value ${index}`).toBe(false)
			}
		})
	})

	describe('isAggregateResult', () => {
		it('accepts a populated real-engine batch, unknown members, and a class instance', () => {
			const program = createProgram(batchAggregateProgramDefinition)
			const result = program.execute([
				{ id: 'east', licensed: true, amount: 10, location: 'east' },
				{ id: 'west', licensed: false, amount: 20, location: 'west' },
			])
			expect(result.subjects).toHaveLength(2)
			expect(result.groups).toHaveLength(2)
			expect(result.sums.amount).toBe(30)
			expect(result.tallies.eligible.count).toBe(1)
			expect(result.tallies.ineligible.count).toBe(1)
			expect(isAggregateResult(result)).toBe(true)
			expect(isAggregateResult({ ...result, extra: true })).toBe(true)
			expect(isAggregateResult(createResultClass(result))).toBe(true)
			program.destroy()
		})

		it('refuses every malformed member and arrays', () => {
			const program = createProgram(batchAggregateProgramDefinition)
			const result = program.execute([eligibleSubject])
			expect(isAggregateResult({ ...result, id: 1 })).toBe(false)
			expect(isAggregateResult({ ...result, name: 1 })).toBe(false)
			expect(isAggregateResult({ ...result, subjects: [{}] })).toBe(false)
			expect(isAggregateResult({ ...result, determinations: [{}] })).toBe(false)
			expect(isAggregateResult({ ...result, groups: [{}] })).toBe(false)
			expect(isAggregateResult({ ...result, tallies: {} })).toBe(false)
			expect(isAggregateResult({ ...result, count: '1' })).toBe(false)
			expect(isAggregateResult({ ...result, sums: { amount: '1' } })).toBe(false)
			expect(isAggregateResult({ ...result, success: 'yes' })).toBe(false)
			expect(isAggregateResult({ ...result, trace: [1] })).toBe(false)
			expect(isAggregateResult({ ...result, errors: [1] })).toBe(false)
			expect(isAggregateResult([])).toBe(false)
			program.destroy()
		})

		it('refuses a ProgramResult outside batch-result membership', () => {
			const program = createProgram(standardProgramDefinition)
			expect(isAggregateResult(program.execute(eligibleSubject))).toBe(false)
			program.destroy()
		})

		it('refuses every hostile value without throwing', () => {
			for (const [index, value] of createHostileValues().entries()) {
				let accepted: boolean | undefined
				expect(() => {
					accepted = isAggregateResult(value)
				}, `hostile value ${index}`).not.toThrow()
				expect(accepted, `hostile value ${index}`).toBe(false)
			}
		})
	})

	describe('isProgramValidationResult', () => {
		it('accepts a populated real validation, unknown members, and a class instance', () => {
			const definition = buildProgramDefinition(
				'',
				'',
				qualificationDefinition('qualification', 'Qualification', []),
				ratingDefinition('rating', 'Rating', []),
			)
			const program = createProgram(definition, { validate: false })
			const result = program.validate()
			expect(result.valid).toBe(false)
			expect(result.errors.length).toBeGreaterThan(0)
			expect(result.warnings.length).toBeGreaterThan(0)
			expect(isProgramValidationResult(result)).toBe(true)
			expect(isProgramValidationResult({ ...result, extra: true })).toBe(true)
			expect(isProgramValidationResult(createResultClass(result))).toBe(true)
			program.destroy()
		})

		it('refuses malformed members and a ProgramResult outside validation membership', () => {
			const validation = { valid: true, errors: [], warnings: [] }
			expect(isProgramValidationResult({ ...validation, valid: 'yes' })).toBe(false)
			expect(isProgramValidationResult({ ...validation, errors: [1] })).toBe(false)
			expect(isProgramValidationResult({ ...validation, warnings: [1] })).toBe(false)
			expect(isProgramValidationResult([])).toBe(false)

			const program = createProgram(standardProgramDefinition)
			expect(isProgramValidationResult(program.execute(eligibleSubject))).toBe(false)
			program.destroy()
		})

		it('refuses every hostile value without throwing', () => {
			for (const [index, value] of createHostileValues().entries()) {
				let accepted: boolean | undefined
				expect(() => {
					accepted = isProgramValidationResult(value)
				}, `hostile value ${index}`).not.toThrow()
				expect(accepted, `hostile value ${index}`).toBe(false)
			}
		})
	})
})
