import { describe, expect, it } from 'vitest'
import { createProgramManager, programDefinition } from '@src/core'
import { createQualifier } from '@orkestrel/qualifier'
import { createRater } from '@orkestrel/rater'
import { createLogicalReasoner, createQuantitativeReasoner, createReason } from '@orkestrel/reason'
import { createRecorder } from '@orkestrel/test'
import {
	eligibleSubject,
	standardProgramDefinition,
	standardQualification,
	standardRating,
} from '../../../setup.js'
import { qualificationDefinition } from '@orkestrel/qualifier'
import { rulingDefinition } from '@orkestrel/qualifier'
import { logicalDefinition, rule, atom } from '@orkestrel/reason'

function buildDefinition(id: string) {
	return programDefinition(id, `Program ${id}`, standardQualification, standardRating)
}

describe('ProgramManager', () => {
	describe('accessors', () => {
		it('reports size, membership, lookup, insertion order, and fresh arrays', () => {
			const first = buildDefinition('first')
			const second = buildDefinition('second')
			const manager = createProgramManager({ programs: [first, second] })
			expect(manager.size).toBe(2)
			expect(manager.has('first')).toBe(true)
			expect(manager.program('missing')).toBeUndefined()
			expect(manager.program('first')?.execute(eligibleSubject).status).toBe('eligible')
			const programs = [...manager.programs()]
			expect(programs.map((program) => program.id)).toEqual(['first', 'second'])
			programs.pop()
			expect(manager.size).toBe(2)
			manager.destroy()
		})
	})

	describe('add', () => {
		it('throws DUPLICATE with the id string as context', () => {
			const manager = createProgramManager()
			manager.add(standardProgramDefinition)
			let error: unknown
			try {
				manager.add(standardProgramDefinition)
				expect.unreachable('expected DUPLICATE')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'DUPLICATE', context: 'standard' })
			manager.destroy()
		})

		it('throws DEFINITION when validation is enabled', () => {
			const manager = createProgramManager()
			let error: unknown
			try {
				manager.add(programDefinition('', '', standardQualification, standardRating))
				expect.unreachable('expected DEFINITION')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'DEFINITION' })
			manager.destroy()
		})

		it('allows validate:false for extra-key definitions but not MISSING scopes', () => {
			const extra = { ...standardProgramDefinition, extra: true }
			const manager = createProgramManager({ validate: false })
			expect(manager.add(extra).id).toBe('standard')
			manager.destroy()

			const gates = logicalDefinition('gates', 'Gates', [
				rule('always', [atom('id', 'equals', 'x')], atom('blocked', 'equals', true)),
			])
			const missing = programDefinition(
				'missing',
				'Missing',
				qualificationDefinition('q', 'Q', [gates], {
					rulings: [
						rulingDefinition('scope', 'gates', 'always', 'restriction', { scope: 'ghost' }),
					],
				}),
				standardRating,
			)
			const missingManager = createProgramManager({ validate: false })
			let error: unknown
			try {
				missingManager.add(missing)
				expect.unreachable('expected MISSING')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'MISSING' })
			missingManager.destroy()
		})

		it('emits add with the new program id', () => {
			const recorder = createRecorder<readonly [id: string]>()
			const manager = createProgramManager({ on: { add: recorder.handler } })
			manager.add(buildDefinition('added'))
			expect(recorder.calls).toEqual([['added']])
			manager.destroy()
		})
	})

	describe('remove and destroy', () => {
		it('remove() clears all, destroys removed programs, and emits remove per id', () => {
			const removed = createRecorder<readonly [id: string]>()
			const manager = createProgramManager({
				programs: [buildDefinition('a'), buildDefinition('b')],
				on: { remove: removed.handler },
			})
			const first = manager.program('a')
			manager.remove()
			expect(manager.size).toBe(0)
			expect(removed.calls.map((call) => call[0]).sort()).toEqual(['a', 'b'])
			let error: unknown
			try {
				first?.execute(eligibleSubject)
				expect.unreachable('expected DESTROYED')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'DESTROYED' })
			manager.destroy()
		})

		it('remove(id) returns whether removed', () => {
			const manager = createProgramManager({ programs: [buildDefinition('a')] })
			expect(manager.remove('missing')).toBe(false)
			expect(manager.remove('a')).toBe(true)
			expect(manager.has('a')).toBe(false)
			manager.destroy()
		})

		it('remove(ids[]) succeeds only when every id is removed', () => {
			const manager = createProgramManager({
				programs: [buildDefinition('a'), buildDefinition('b')],
			})
			expect(manager.remove(['missing', 'a'])).toBe(false)
			expect(manager.has('a')).toBe(false)
			expect(manager.has('b')).toBe(true)

			const intact = createProgramManager({
				programs: [buildDefinition('a'), buildDefinition('b')],
			})
			expect(intact.remove(['a', 'b'])).toBe(true)
			expect(intact.size).toBe(0)
			intact.destroy()
			manager.destroy()
		})

		it('remove([]) succeeds vacuously', () => {
			const manager = createProgramManager({ programs: [buildDefinition('a')] })
			expect(manager.remove([])).toBe(true)
			expect(manager.size).toBe(1)
			manager.destroy()
		})

		it('destroy clears, emits destroy once, and rejects later calls', () => {
			const destroyed = createRecorder<readonly []>()
			const manager = createProgramManager({
				programs: [buildDefinition('a')],
				on: { destroy: destroyed.handler },
			})
			manager.destroy()
			expect(destroyed.count).toBe(1)
			let error: unknown
			try {
				manager.add(buildDefinition('b'))
				expect.unreachable('expected DESTROYED')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'DESTROYED' })
			manager.destroy()
		})
	})

	describe('scale', () => {
		it('holds hundreds of programs with stable size, lookup, order, and fresh arrays', () => {
			const definitions = Array.from({ length: 250 }, (_, index) =>
				buildDefinition(`program-${index}`),
			)
			const manager = createProgramManager({ programs: definitions })
			expect(manager.size).toBe(250)
			expect(manager.program('program-149')?.id).toBe('program-149')
			const listed = [...manager.programs()]
			expect(listed[0]?.id).toBe('program-0')
			expect(listed[249]?.id).toBe('program-249')
			listed.length = 0
			expect(manager.size).toBe(250)
			manager.destroy()
		})
	})

	describe('adversarial keys', () => {
		it('treats adversarial and unicode ids as ordinary distinct keys', () => {
			const manager = createProgramManager({
				programs: [
					buildDefinition('π-risk'),
					buildDefinition('__proto__'),
					buildDefinition('a\u0061'),
				],
			})
			expect(manager.has('π-risk')).toBe(true)
			expect(manager.has('__proto__')).toBe(true)
			expect(manager.has('aa')).toBe(true)
			expect(manager.has('a\u0061')).toBe(true)
			manager.destroy()
		})

		it('throws DUPLICATE with context when a unicode id is re-added', () => {
			const manager = createProgramManager()
			manager.add(buildDefinition('π-risk'))
			let error: unknown
			try {
				manager.add(buildDefinition('π-risk'))
				expect.unreachable('expected DUPLICATE')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ context: 'π-risk' })
			manager.destroy()
		})

		it('keeps NFC-labile ids distinct', () => {
			const composed = 'e\u0301-lab'
			const precomposed = '\u00e9-lab'
			const manager = createProgramManager({
				programs: [buildDefinition(composed), buildDefinition(precomposed)],
			})
			expect(manager.size).toBe(2)
			expect(manager.has(composed)).toBe(true)
			expect(manager.has(precomposed)).toBe(true)
			manager.destroy()
		})
	})

	describe('shared dependencies', () => {
		it('does not destroy injected qualifier, rater, or engine', () => {
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const qualifier = createQualifier({ engine })
			const rater = createRater({ engine })
			const manager = createProgramManager({
				qualifier,
				rater,
				engine,
				programs: [standardProgramDefinition],
			})
			manager.destroy()
			expect(qualifier.qualify(eligibleSubject, standardQualification).success).toBe(true)
			qualifier.destroy()
			rater.destroy()
			engine.destroy()
		})
	})

	describe('listener error isolation', () => {
		it('isolates a throwing add listener and still runs a sibling listener', () => {
			const errors = createRecorder<readonly [error: unknown, event: string]>()
			const sibling = createRecorder<readonly [id: string]>()
			const manager = createProgramManager({ error: errors.handler })
			manager.emitter.on('add', () => {
				throw new Error('listener boom')
			})
			manager.emitter.on('add', sibling.handler)
			const program = manager.add(buildDefinition('isolated'))
			expect(program.id).toBe('isolated')
			expect(errors.count).toBe(1)
			expect(errors.calls[0]?.[1]).toBe('add')
			expect(sibling.count).toBe(1)
			manager.destroy()
		})
	})

	describe('reentrancy', () => {
		it('supports a remove listener that destroys the manager mid-drain', () => {
			const destroyed = createRecorder<readonly []>()
			const manager = createProgramManager({
				programs: [buildDefinition('a'), buildDefinition('b')],
				on: { destroy: destroyed.handler },
			})
			manager.emitter.on('remove', () => {
				manager.destroy()
			})
			expect(() => manager.destroy()).not.toThrow()
			expect(destroyed.count).toBe(1)
		})

		it('destroy is idempotent after a listener re-entry', () => {
			const manager = createProgramManager({ programs: [buildDefinition('a')] })
			manager.emitter.on('remove', () => {
				manager.destroy()
			})
			manager.destroy()
			expect(() => manager.destroy()).not.toThrow()
		})
	})

	describe('construction-failure teardown', () => {
		it('throws DUPLICATE, fires remove once and destroy once, and leaves injected deps usable', () => {
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const qualifier = createQualifier({ engine })
			const rater = createRater({ engine })
			const removed = createRecorder<readonly [id: string]>()
			const destroyed = createRecorder<readonly []>()
			let error: unknown
			try {
				createProgramManager({
					qualifier,
					rater,
					engine,
					programs: [standardProgramDefinition, standardProgramDefinition],
					on: { remove: removed.handler, destroy: destroyed.handler },
				})
				expect.unreachable('expected DUPLICATE')
			} catch (caught) {
				error = caught
			}
			expect(error).toMatchObject({ code: 'DUPLICATE' })
			expect(removed.count).toBe(1)
			expect(destroyed.count).toBe(1)
			expect(qualifier.qualify(eligibleSubject, standardQualification).success).toBe(true)
			qualifier.destroy()
			rater.destroy()
			engine.destroy()
		})
	})

	describe('post-destroy accessors', () => {
		it('throws DESTROYED from every accessor and mutator, but keeps the emitter reachable', () => {
			const manager = createProgramManager({ programs: [buildDefinition('a')] })
			manager.destroy()
			expect(() => manager.size).toThrowError(expect.objectContaining({ code: 'DESTROYED' }))
			expect(() => manager.has('a')).toThrowError(expect.objectContaining({ code: 'DESTROYED' }))
			expect(() => manager.program('a')).toThrowError(
				expect.objectContaining({ code: 'DESTROYED' }),
			)
			expect(() => manager.programs()).toThrowError(expect.objectContaining({ code: 'DESTROYED' }))
			expect(() => manager.remove('a')).toThrowError(expect.objectContaining({ code: 'DESTROYED' }))
			expect(() => manager.add(buildDefinition('b'))).toThrowError(
				expect.objectContaining({ code: 'DESTROYED' }),
			)
			expect(() => manager.emitter).not.toThrow()
		})
	})
})
