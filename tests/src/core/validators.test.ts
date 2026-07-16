import { describe, expect, it } from 'vitest'
import {
	isAggregateDefinition,
	isDecision,
	isNotice,
	isProgramDefinition,
	isProgramEffect,
	isStatus,
} from '@src/core'
import {
	baseLine,
	standardProgramDefinition,
	standardQualification,
	standardRating,
} from '../../setup.js'
import { aggregateDefinition, noticeDefinition, programDefinition } from '@src/core'
import { logicalDefinition, rule, atom } from '@orkestrel/reason'

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
			expect(isNotice(noticeDefinition('audit', 'Audit trail'))).toBe(true)
			expect(isNotice(noticeDefinition('scoped', 'Scoped', { scope: 'base' }))).toBe(true)
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
			expect(isAggregateDefinition(aggregateDefinition(['amount']))).toBe(true)
			expect(
				isAggregateDefinition(
					aggregateDefinition(['amount'], {
						by: 'location',
						gates: logicalDefinition('gates', 'Gates', [
							rule('cap', [atom('total', 'above', 1)], atom('limited', 'equals', true)),
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
			const definition = programDefinition(
				'scope-test',
				'Scope test',
				standardQualification,
				standardRating,
				{ notices: [noticeDefinition('missing', 'Missing', { scope: 'missing-line' })] },
			)
			expect(isProgramDefinition(definition)).toBe(true)
			expect(definition.notices?.[0]?.scope).toBe('missing-line')
			expect(baseLine.id).toBe('base')
		})
	})
})
