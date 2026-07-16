import { describe, expect, it } from 'vitest'
import * as barrel from '@src/core'
import { createProgram, createProgramManager } from '@src/core'
import { createQualifier } from '@orkestrel/qualifier'
import { createRater } from '@orkestrel/rater'
import {
	buildCarrierProgram,
	createRecordingRater,
	createRecordingEngine,
	eligibleSubject,
	failedQualificationProgramDefinition,
	frameSubject,
	ineligibleSubject,
	referralProgramDefinition,
	referralSubject,
	scopedProgramDefinition,
	standardProgramDefinition,
} from '../../setup.js'

describe('integrations', () => {
	describe('no-rate proof', () => {
		it('never calls the rater for terminal or fully scoped-out subjects', () => {
			const ineligibleRater = createRecordingRater()
			const program = createProgram(standardProgramDefinition, { rater: ineligibleRater })
			program.execute(ineligibleSubject)
			expect(ineligibleRater.count).toBe(0)
			program.destroy()
			ineligibleRater.destroy()

			const referralRater = createRecordingRater()
			const referral = createProgram(referralProgramDefinition, { rater: referralRater })
			referral.execute(referralSubject)
			expect(referralRater.count).toBe(0)
			referral.destroy()
			referralRater.destroy()

			const scopedRater = createRecordingRater()
			const windLine = scopedProgramDefinition.rating.lines[0]
			if (windLine === undefined) {
				throw new Error('scopedProgramDefinition must define at least one rating line')
			}
			const windOnly = {
				...scopedProgramDefinition,
				rating: {
					...scopedProgramDefinition.rating,
					lines: [windLine],
				},
			}
			const scoped = createProgram(windOnly, { rater: scopedRater })
			scoped.execute(frameSubject)
			expect(scopedRater.count).toBe(0)
			scoped.destroy()
			scopedRater.destroy()
		})

		it('never calls the rater when qualification fails', () => {
			const rater = createRecordingRater()
			const program = createProgram(failedQualificationProgramDefinition, { rater })
			const result = program.execute(eligibleSubject)
			expect(rater.count).toBe(0)
			expect(result.qualification.success).toBe(false)
			expect(result.rating).toBeUndefined()
			program.destroy()
			rater.destroy()
		})

		it('records exact line lists for scoped removal', () => {
			const rater = createRecordingRater()
			const program = createProgram(scopedProgramDefinition, { rater })
			program.execute(frameSubject)
			expect(rater.calls).toHaveLength(1)
			expect(rater.calls[0]?.lines.map((line) => line.id)).toEqual(['exWind'])
			program.destroy()
			rater.destroy()
		})
	})

	describe('original-subject proof', () => {
		it('passes the caller subject to the rater without aggregate projection', () => {
			const rater = createRecordingRater()
			const program = createProgram(standardProgramDefinition, { rater })
			const subject = { id: 'batch-subject', licensed: true, amount: 15, location: 'east' }
			program.execute([subject, { id: 'other', licensed: false, amount: 5, location: 'west' }])
			expect(rater.calls.every((call) => call.subject.aggregate === undefined)).toBe(true)
			expect(rater.calls.some((call) => call.subject === subject)).toBe(true)
			program.destroy()
			rater.destroy()
		})
	})

	describe('shared-engine ownership', () => {
		it('leaves injected engine usable after program destroy', () => {
			const engine = createRecordingEngine()
			const qualifier = createQualifier({ engine })
			const rater = createRater({ engine })
			const program = createProgram(standardProgramDefinition, { engine, qualifier, rater })
			program.destroy()
			program.destroy()
			expect(engine.destroyCount).toBe(0)
			expect(
				qualifier.qualify(eligibleSubject, standardProgramDefinition.qualification).success,
			).toBe(true)
			expect(rater.rate(standardProgramDefinition.rating.lines, eligibleSubject).success).toBe(true)
			qualifier.destroy()
			rater.destroy()
			engine.destroy()
			expect(engine.destroyCount).toBe(1)
		})

		it('destroys owned dependencies idempotently through the public surface', () => {
			const program = createProgram(standardProgramDefinition)
			program.execute(eligibleSubject)
			program.destroy()
			program.destroy()
			expect(() => program.execute(eligibleSubject)).toThrowError(
				expect.objectContaining({ code: 'DESTROYED' }),
			)
		})

		it('shares one manager qualifier and rater across compiled programs', () => {
			const firstRater = createRecordingRater()
			const manager = createProgramManager({ rater: firstRater })
			const first = manager.add(standardProgramDefinition)
			const second = manager.add({
				...standardProgramDefinition,
				id: 'second',
				name: 'Second program',
			})
			first.execute(eligibleSubject)
			second.execute(eligibleSubject)
			expect(firstRater.count).toBe(2)
			manager.destroy()
			firstRater.destroy()
		})
	})

	describe('carrier-style integration', () => {
		it('qualifies first, rates surviving lines, and nests qualification and rating evidence', () => {
			const program = createProgram(buildCarrierProgram())
			const eligible = program.execute({ id: 'carrier-eligible', licensed: true })
			expect(eligible.qualification.eligibility).toBe('eligible')
			expect(eligible.rating?.lines).toHaveLength(1)
			expect(eligible.rating?.total).toBe(10)
			expect(eligible.determinations.some((entry) => entry.effect === 'notice')).toBe(true)
			expect(eligible.decision).toBe('approved')

			const denied = program.execute({ id: 'carrier-denied', licensed: false })
			expect(denied.qualification.eligibility).toBe('ineligible')
			expect(denied.rating).toBeUndefined()
			expect(denied.decision).toBe('denied')
			program.destroy()
		})
	})

	describe('barrel exclusion', () => {
		it('never re-exports collaborator internals from @orkestrel/qualifier, @orkestrel/rater, or @orkestrel/reason', () => {
			expect('QuantitativeReasoner' in barrel).toBe(false)
			expect('Factor' in barrel).toBe(false)
			expect('WorksheetFactor' in barrel).toBe(false)
			expect('Rater' in barrel).toBe(false)
		})

		it('still exports the program surface', () => {
			expect('createProgram' in barrel).toBe(true)
			expect('createProgramManager' in barrel).toBe(true)
			expect('programDefinition' in barrel).toBe(true)
		})
	})
})
