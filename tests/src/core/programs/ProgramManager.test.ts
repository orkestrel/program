import { describe, expect, it } from 'vitest'
import { buildProgramDefinition, createProgramManager } from '@src/core'
import { createQualifier } from '@orkestrel/qualifier'
import { createRater } from '@orkestrel/rater'
import { createLogicalReasoner, createQuantitativeReasoner, createReason } from '@orkestrel/reason'
import { captureError, createRecorder } from '@orkestrel/test'
import {
	buildStandardProgramDefinition,
	eligibleSubject,
	standardProgramDefinition,
	standardQualification,
	standardRating,
} from '../../../setup.js'
import { createQualificationDefinition } from '@orkestrel/qualifier'
import { createRuling } from '@orkestrel/qualifier'
import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'

describe('ProgramManager', () => {
	describe('accessors', () => {
		it('reports count, membership, lookup, insertion order, and fresh arrays', () => {
			const first = buildStandardProgramDefinition('first')
			const second = buildStandardProgramDefinition('second')
			const manager = createProgramManager({ programs: [first, second] })
			expect(manager.count).toBe(2)
			expect(manager.has('first')).toBe(true)
			expect(manager.program('missing')).toBeUndefined()
			expect(manager.program('first')?.execute(eligibleSubject).status).toBe('eligible')
			const programs = [...manager.programs()]
			expect(programs.map((program) => program.id)).toEqual(['first', 'second'])
			programs.pop()
			expect(manager.count).toBe(2)
			manager.destroy()
		})
	})

	describe('add', () => {
		it('throws DUPLICATE with the id string as context', () => {
			const manager = createProgramManager()
			manager.add(standardProgramDefinition)
			expect(captureError(() => manager.add(standardProgramDefinition))).toMatchObject({
				code: 'DUPLICATE',
				context: 'standard',
			})
			manager.destroy()
		})

		it('throws DEFINITION when validation is enabled', () => {
			const manager = createProgramManager()
			expect(
				captureError(() =>
					manager.add(buildProgramDefinition('', '', standardQualification, standardRating)),
				),
			).toMatchObject({ code: 'DEFINITION' })
			manager.destroy()
		})

		it('allows validate:false for extra-key definitions but not MISSING scopes', () => {
			const extra = { ...standardProgramDefinition, extra: true }
			const manager = createProgramManager({ validate: false })
			expect(manager.add(extra).id).toBe('standard')
			manager.destroy()

			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule(
					'always',
					[createAtom('id', 'equals', 'x')],
					createAtom('blocked', 'equals', true),
				),
			])
			const missing = buildProgramDefinition(
				'missing',
				'Missing',
				createQualificationDefinition('q', 'Q', [gates], {
					rulings: [createRuling('scope', 'gates', 'always', 'restriction', { scope: 'ghost' })],
				}),
				standardRating,
			)
			const missingManager = createProgramManager({ validate: false })
			expect(captureError(() => missingManager.add(missing))).toMatchObject({ code: 'MISSING' })
			missingManager.destroy()
		})

		it('emits add with the new program id', () => {
			const recorder = createRecorder<readonly [id: string]>()
			const manager = createProgramManager({ on: { add: recorder.handler } })
			manager.add(buildStandardProgramDefinition('added'))
			expect(recorder.calls).toEqual([['added']])
			manager.destroy()
		})
	})

	describe('remove and destroy', () => {
		it('remove() clears all, destroys removed programs, and emits remove per id', () => {
			const removed = createRecorder<readonly [id: string]>()
			const manager = createProgramManager({
				programs: [buildStandardProgramDefinition('a'), buildStandardProgramDefinition('b')],
				on: { remove: removed.handler },
			})
			const first = manager.program('a')
			manager.remove()
			expect(manager.count).toBe(0)
			expect(removed.calls.map((call) => call[0]).sort()).toEqual(['a', 'b'])
			expect(captureError(() => first?.execute(eligibleSubject))).toMatchObject({
				code: 'DESTROYED',
			})
			manager.destroy()
		})

		it('remove(id) returns whether removed', () => {
			const manager = createProgramManager({ programs: [buildStandardProgramDefinition('a')] })
			expect(manager.remove('missing')).toBe(false)
			expect(manager.remove('a')).toBe(true)
			expect(manager.has('a')).toBe(false)
			manager.destroy()
		})

		it('remove(ids[]) succeeds only when every id is removed', () => {
			const manager = createProgramManager({
				programs: [buildStandardProgramDefinition('a'), buildStandardProgramDefinition('b')],
			})
			expect(manager.remove(['missing', 'a'])).toBe(false)
			expect(manager.has('a')).toBe(false)
			expect(manager.has('b')).toBe(true)

			const intact = createProgramManager({
				programs: [buildStandardProgramDefinition('a'), buildStandardProgramDefinition('b')],
			})
			expect(intact.remove(['a', 'b'])).toBe(true)
			expect(intact.count).toBe(0)
			intact.destroy()
			manager.destroy()
		})

		it('remove([]) succeeds vacuously', () => {
			const manager = createProgramManager({ programs: [buildStandardProgramDefinition('a')] })
			expect(manager.remove([])).toBe(true)
			expect(manager.count).toBe(1)
			manager.destroy()
		})

		it('destroy clears, emits destroy once, and rejects later calls', () => {
			const destroyed = createRecorder<readonly []>()
			const manager = createProgramManager({
				programs: [buildStandardProgramDefinition('a')],
				on: { destroy: destroyed.handler },
			})
			manager.destroy()
			expect(destroyed.count).toBe(1)
			expect(captureError(() => manager.add(buildStandardProgramDefinition('b')))).toMatchObject({
				code: 'DESTROYED',
			})
			manager.destroy()
		})
	})

	describe('scale', () => {
		it('preserves count, lookup, order, and fresh arrays for a generated program collection', () => {
			const definitions = Array.from({ length: 250 }, (_, index) =>
				buildStandardProgramDefinition(`program-${index}`),
			)
			const manager = createProgramManager({ programs: definitions })
			expect(manager.count).toBe(250)
			expect(manager.program('program-149')?.id).toBe('program-149')
			const listed = [...manager.programs()]
			expect(listed[0]?.id).toBe('program-0')
			expect(listed[249]?.id).toBe('program-249')
			listed.length = 0
			expect(manager.count).toBe(250)
			manager.destroy()
		})
	})

	describe('adversarial keys', () => {
		it('treats adversarial and unicode ids as ordinary distinct keys', () => {
			const manager = createProgramManager({
				programs: [
					buildStandardProgramDefinition('π-risk'),
					buildStandardProgramDefinition('__proto__'),
					buildStandardProgramDefinition('a\u0061'),
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
			manager.add(buildStandardProgramDefinition('π-risk'))
			expect(
				captureError(() => manager.add(buildStandardProgramDefinition('π-risk'))),
			).toMatchObject({ context: 'π-risk' })
			manager.destroy()
		})

		it('keeps NFC-labile ids distinct', () => {
			const composed = 'e\u0301-lab'
			const precomposed = '\u00e9-lab'
			const manager = createProgramManager({
				programs: [
					buildStandardProgramDefinition(composed),
					buildStandardProgramDefinition(precomposed),
				],
			})
			expect(manager.count).toBe(2)
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
			const program = manager.add(buildStandardProgramDefinition('isolated'))
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
				programs: [buildStandardProgramDefinition('a'), buildStandardProgramDefinition('b')],
				on: { destroy: destroyed.handler },
			})
			manager.emitter.on('remove', () => {
				manager.destroy()
			})
			expect(() => manager.destroy()).not.toThrow()
			expect(destroyed.count).toBe(1)
		})

		it('destroy is idempotent after a listener re-entry', () => {
			const manager = createProgramManager({ programs: [buildStandardProgramDefinition('a')] })
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
			expect(
				captureError(() =>
					createProgramManager({
						qualifier,
						rater,
						engine,
						programs: [standardProgramDefinition, standardProgramDefinition],
						on: { remove: removed.handler, destroy: destroyed.handler },
					}),
				),
			).toMatchObject({ code: 'DUPLICATE' })
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
			const manager = createProgramManager({ programs: [buildStandardProgramDefinition('a')] })
			manager.destroy()
			expect(() => manager.count).toThrow(expect.objectContaining({ code: 'DESTROYED' }))
			expect(() => manager.has('a')).toThrow(expect.objectContaining({ code: 'DESTROYED' }))
			expect(() => manager.program('a')).toThrow(expect.objectContaining({ code: 'DESTROYED' }))
			expect(() => manager.programs()).toThrow(expect.objectContaining({ code: 'DESTROYED' }))
			expect(() => manager.remove('a')).toThrow(expect.objectContaining({ code: 'DESTROYED' }))
			expect(() => manager.add(buildStandardProgramDefinition('b'))).toThrow(
				expect.objectContaining({ code: 'DESTROYED' }),
			)
			expect(() => manager.emitter).not.toThrow()
		})
	})
})
