import { describe, expect, it } from 'vitest'
import type { FieldPath } from '@orkestrel/contract'
import {
	aggregateDefinition,
	createProgram,
	createProgramManager,
	noticeDefinition,
	programDefinition,
} from '@src/core'
import { isProgramError } from '@src/core'
import { rulingDefinition, qualificationDefinition } from '@orkestrel/qualifier'
import { lineDefinition, ratingDefinition } from '@orkestrel/rater'
import { logicalDefinition, rule, atom } from '@orkestrel/reason'
import {
	baseLine,
	standardProgramDefinition,
	standardQualification,
	standardRating,
} from '../../setup.js'

describe('factories', () => {
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

	describe('createProgram', () => {
		it('validates on create by default', () => {
			const gates = logicalDefinition('gates', 'Gates', [
				rule('bad', [atom('x', 'equals', true)], atom('y', 'equals', true)),
			])
			const qualification = qualificationDefinition('bad-qualification', 'Bad', [gates], {
				rulings: [
					rulingDefinition('missing', 'gates', 'bad', 'restriction', { scope: 'missing-line' }),
				],
			})
			const definition = programDefinition('bad', 'Bad', qualification, standardRating)
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
			const gates = logicalDefinition('gates', 'Gates', [
				rule('always', [atom('id', 'equals', 'x')], atom('blocked', 'equals', true)),
			])
			const withPass = qualificationDefinition('missing-qualification', 'Missing', [gates], {
				...(qualification.rulings === undefined ? {} : { rulings: qualification.rulings }),
			})
			const definition = programDefinition('missing', 'Missing', withPass, standardRating)
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
			const definition = programDefinition(
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
			const definition = programDefinition(
				'dup-notice',
				'Dup notice',
				qualificationDefinition('dup-notice-qualification', 'Dup notice qualification', []),
				undefined,
				{ notices: [noticeDefinition('n', 'First'), noticeDefinition('n', 'Second')] },
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
