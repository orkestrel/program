import { describe, expect, it } from 'vitest'
import { buildNotice, buildProgramDefinition, createProgram, createProgramManager } from '@src/core'
import { isProgramError } from '@src/core'
import { createQualificationDefinition, createRuling } from '@orkestrel/qualifier'
import { buildLineDefinition, buildRatingDefinition } from '@orkestrel/rater'
import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
import { captureError } from '@orkestrel/test'
import {
	baseLine,
	standardProgramDefinition,
	standardQualification,
	standardRating,
} from '../../setup.js'

describe('factories', () => {
	describe('createProgram', () => {
		it('validates on create by default', () => {
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule('bad', [createAtom('x', 'equals', true)], createAtom('y', 'equals', true)),
			])
			const qualification = createQualificationDefinition('bad-qualification', 'Bad', [gates], {
				rulings: [
					createRuling('missing', 'gates', 'bad', 'restriction', { scope: 'missing-line' }),
				],
			})
			const definition = buildProgramDefinition('bad', 'Bad', qualification, standardRating)
			expect(captureError(() => createProgram(definition))).toSatisfy(
				(value): boolean =>
					isProgramError(value) && (value.code === 'MISSING' || value.code === 'DEFINITION'),
			)
		})

		it('throws MISSING at construction regardless of validate', () => {
			const qualification = createQualificationDefinition('missing-qualification', 'Missing', [], {
				rulings: [createRuling('scope', 'gates', 'scope', 'restriction', { scope: 'ghost' })],
			})
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule(
					'always',
					[createAtom('id', 'equals', 'x')],
					createAtom('blocked', 'equals', true),
				),
			])
			const withPass = createQualificationDefinition('missing-qualification', 'Missing', [gates], {
				...(qualification.rulings === undefined ? {} : { rulings: qualification.rulings }),
			})
			const definition = buildProgramDefinition('missing', 'Missing', withPass, standardRating)
			expect(captureError(() => createProgram(definition, { validate: false }))).toMatchObject({
				code: 'MISSING',
				context: 'missing',
			})
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
				createQualificationDefinition('dup-line-qualification', 'Dup line qualification', []),
				buildRatingDefinition('dup-line-rating', 'Dup line rating', [
					buildLineDefinition('base', 'Base', baseLine.rate),
					buildLineDefinition('base', 'Base again', baseLine.rate),
				]),
			)
			expect(captureError(() => createProgram(definition, { validate: false }))).toMatchObject({
				code: 'DUPLICATE',
			})
		})

		it('throws DUPLICATE for duplicate notice ids regardless of validate', () => {
			const definition = buildProgramDefinition(
				'dup-notice',
				'Dup notice',
				createQualificationDefinition('dup-notice-qualification', 'Dup notice qualification', []),
				undefined,
				{ notices: [buildNotice('n', 'First'), buildNotice('n', 'Second')] },
			)
			expect(captureError(() => createProgram(definition, { validate: false }))).toMatchObject({
				code: 'DUPLICATE',
			})
		})
	})

	describe('createProgramManager', () => {
		it('seeds programs from options', () => {
			const manager = createProgramManager({ programs: [standardProgramDefinition] })
			expect(manager.count).toBe(1)
			expect(manager.has('standard')).toBe(true)
			manager.destroy()
		})

		it('defaults validate to true', () => {
			// Empty id and name pass `assertProgramDefinition` and fail only
			// `validateProgramDefinition`, so the definition separates the two branches.
			const definition = buildProgramDefinition('', '', standardQualification, standardRating)
			const validating = createProgramManager()
			expect(captureError(() => validating.add(definition))).toMatchObject({ code: 'DEFINITION' })
			validating.destroy()

			const permissive = createProgramManager({ validate: false })
			expect(permissive.add(definition).id).toBe('')
			permissive.destroy()
		})
	})
})
