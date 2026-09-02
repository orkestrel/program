import { describe, expect, it } from 'vitest'
import { buildNotice, buildProgramDefinition, createProgram, createProgramManager } from '@src/core'
import { isProgramError } from '@src/core'
import { qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'
import { lineDefinition, ratingDefinition } from '@orkestrel/rater'
import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
import { baseLine, standardProgramDefinition, standardRating } from '../../setup.js'

describe('factories', () => {
	describe('createProgram', () => {
		it('validates on create by default', () => {
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule('bad', [createAtom('x', 'equals', true)], createAtom('y', 'equals', true)),
			])
			const qualification = qualificationDefinition('bad-qualification', 'Bad', [gates], {
				rulings: [
					rulingDefinition('missing', 'gates', 'bad', 'restriction', { scope: 'missing-line' }),
				],
			})
			const definition = buildProgramDefinition('bad', 'Bad', qualification, standardRating)
			let error: unknown
			try {
				createProgram(definition)
				expect.unreachable('expected DEFINITION or MISSING')
			} catch (caught) {
				error = caught
			}
			expect(error).toSatisfy(
				(value): boolean =>
					isProgramError(value) && (value.code === 'MISSING' || value.code === 'DEFINITION'),
			)
		})

		it('throws MISSING at construction regardless of validate', () => {
			const qualification = qualificationDefinition('missing-qualification', 'Missing', [], {
				rulings: [rulingDefinition('scope', 'gates', 'scope', 'restriction', { scope: 'ghost' })],
			})
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule(
					'always',
					[createAtom('id', 'equals', 'x')],
					createAtom('blocked', 'equals', true),
				),
			])
			const withPass = qualificationDefinition('missing-qualification', 'Missing', [gates], {
				...(qualification.rulings === undefined ? {} : { rulings: qualification.rulings }),
			})
			const definition = buildProgramDefinition('missing', 'Missing', withPass, standardRating)
			let error: unknown
			try {
				createProgram(definition, { validate: false })
				expect.unreachable('expected MISSING')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'MISSING', context: 'missing' })
		})

		it('creates a valid program from a sound definition', () => {
			const program = createProgram(standardProgramDefinition)
			expect(program.id).toBe('standard')
			expect(program.name).toBe('Standard program')
			program.destroy()
		})

		it('throws DUPLICATE for duplicate rating-line ids regardless of validate', () => {
			const definition = buildProgramDefinition(
				'dup-line',
				'Dup line',
				qualificationDefinition('dup-line-qualification', 'Dup line qualification', []),
				ratingDefinition('dup-line-rating', 'Dup line rating', [
					lineDefinition('base', 'Base', baseLine.rate),
					lineDefinition('base', 'Base again', baseLine.rate),
				]),
			)
			let error: unknown
			try {
				createProgram(definition, { validate: false })
				expect.unreachable('expected DUPLICATE')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'DUPLICATE' })
		})

		it('throws DUPLICATE for duplicate notice ids regardless of validate', () => {
			const definition = buildProgramDefinition(
				'dup-notice',
				'Dup notice',
				qualificationDefinition('dup-notice-qualification', 'Dup notice qualification', []),
				undefined,
				{ notices: [buildNotice('n', 'First'), buildNotice('n', 'Second')] },
			)
			let error: unknown
			try {
				createProgram(definition, { validate: false })
				expect.unreachable('expected DUPLICATE')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'DUPLICATE' })
		})
	})

	describe('createProgramManager', () => {
		it('seeds programs from options', () => {
			const manager = createProgramManager({ programs: [standardProgramDefinition] })
			expect(manager.size).toBe(1)
			expect(manager.has('standard')).toBe(true)
			manager.destroy()
		})

		it('defaults validate to true', () => {
			const manager = createProgramManager()
			expect(manager.size).toBe(0)
			manager.destroy()
		})
	})
})
