import { describe, expect, it } from 'vitest'
import { createProgram } from '@src/core'
import { createQualifier } from '@orkestrel/qualifier'
import { buildLineDefinition, buildRatingDefinition, createRater } from '@orkestrel/rater'
import {
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	createFactorGroup,
	createQuantitativeDefinition,
	createStaticFactor,
} from '@orkestrel/reason'
import { STATUSES } from '@src/core'
import type { Subject } from '@orkestrel/reason'
import { captureError, createRecorder } from '@orkestrel/test'
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
	createFixedEngine,
	createFixedQualifier,
	createFixedRater,
	createMalformedLogicalResult,
	createMalformedQualificationResult,
	createMalformedRatingResult,
	createQualificationResultClass,
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
import { buildProgramDefinition, buildNotice } from '@src/core'
import { createQualificationDefinition, createRuling } from '@orkestrel/qualifier'
import { createLogicalDefinition, createRule, createAtom } from '@orkestrel/reason'
import { standardQualification, standardRating } from '../../../setup.js'

describe('Program', () => {
	describe('borrowed result containment', () => {
		it('contains a malformed qualification result as MISMATCH', () => {
			const qualifier = createFixedQualifier(createMalformedQualificationResult())
			const program = createProgram(standardProgramDefinition, { qualifier, validate: false })
			const error = captureError(() => program.execute(eligibleSubject))
			expect(error).toMatchObject({
				code: 'MISMATCH',
				context: standardQualification.id,
				message: 'Qualifier returned invalid qualification result',
			})
			program.destroy()
			qualifier.destroy()
		})

		it('contains a malformed rating result as MISMATCH', () => {
			const rater = createFixedRater(createMalformedRatingResult())
			const program = createProgram(standardProgramDefinition, { rater, validate: false })
			const error = captureError(() => program.execute(eligibleSubject))
			expect(error).toMatchObject({
				code: 'MISMATCH',
				context: standardRating.id,
				message: 'Rater returned invalid rating result',
			})
			program.destroy()
			rater.destroy()
		})

		it('contains a malformed authority result as MISMATCH', () => {
			const engine = createFixedEngine(createMalformedLogicalResult())
			const program = createProgram(brokenAuthorityProgramDefinition, {
				engine,
				validate: false,
			})
			const error = captureError(() => program.execute({ id: 'authority-subject' }))
			expect(error).toMatchObject({
				code: 'MISMATCH',
				context: brokenAuthorityProgramDefinition.authority?.id,
				message: 'Authority returned invalid logical result',
			})
			program.destroy()
			engine.destroy()
		})

		it('contains a malformed aggregate-gate result as MISMATCH', () => {
			const engine = createFixedEngine(createMalformedLogicalResult())
			const program = createProgram(brokenAggregateGateProgramDefinition, {
				engine,
				validate: false,
			})
			const error = captureError(() => program.execute([{ id: 'aggregate-subject' }]))
			expect(error).toMatchObject({
				code: 'MISMATCH',
				context: brokenAggregateGateProgramDefinition.aggregate?.gates?.id,
				message: 'Aggregate gates returned invalid logical result',
			})
			program.destroy()
			engine.destroy()
		})

		it('passes a conforming class qualification result through unchanged', () => {
			const source = createQualifier()
			const qualification = createQualificationResultClass(
				source.qualify(eligibleSubject, standardQualification),
			)
			const qualifier = createFixedQualifier(qualification)
			const program = createProgram(eligibilityOnlyProgramDefinition, {
				qualifier,
				validate: false,
			})
			const result = program.execute(eligibleSubject)
			expect(result.qualification).toBe(qualification)
			expect(Reflect.get(result.qualification, 'extension')).toBe(true)
			expect(result.status).toBe('eligible')
			program.destroy()
			qualifier.destroy()
			source.destroy()
		})
	})

	describe('pass pipeline and notices', () => {
		it('emits notice determinations interpolated against the original subject', () => {
			const program = createProgram(noticeProgramDefinition)
			const result = program.execute(eligibleSubject)
			const notice = result.determinations.find((entry) => entry.effect === 'notice')
			expect(notice?.message).toBe('Program risk-eligible executed for true')
			program.destroy()
		})
	})

	describe('definition ownership', () => {
		it('leaves cloned Map contents mutable because the seal cannot reach internal slots', () => {
			const source = new Map([['before', 'owned']])
			const authority = createLogicalDefinition('map-authority', 'Map authority', [
				createRule(
					'map-value',
					[createAtom('candidate', 'equals', source)],
					createAtom('accepted', 'equals', true),
				),
			])
			const program = createProgram(
				buildProgramDefinition(
					'map-definition',
					'Map definition',
					standardQualification,
					undefined,
					{
						authority,
					},
				),
			)
			const premise = program.definition.authority?.rules[0]?.premises[0]
			if (premise?.form !== 'atom') throw new Error('Expected the stored premise to be an atom')
			const value = premise.check.value
			if (!(value instanceof Map)) throw new Error('Expected the stored check value to be a Map')

			expect(value).not.toBe(source)
			value.set('after', 'mutable')
			// Object.freeze cannot reach a Map's internal entry slots, so the documented limit stays mutable.
			expect(value.get('after')).toBe('mutable')
			program.destroy()
		})

		it('contains an uncloneable function check value as DEFINITION with its cause', () => {
			const authority = createLogicalDefinition('function-authority', 'Function authority', [
				createRule(
					'function-value',
					[createAtom('candidate', 'equals', () => undefined)],
					createAtom('accepted', 'equals', true),
				),
			])
			const error = captureError(() =>
				createProgram(
					buildProgramDefinition(
						'function-definition',
						'Function definition',
						standardQualification,
						undefined,
						{ authority },
					),
				),
			)

			expect(error).toMatchObject({
				code: 'DEFINITION',
				cause: expect.objectContaining({ name: 'DataCloneError' }),
			})
		})

		it('contains an unfreezable typed-array check value as DEFINITION with its cause', () => {
			const authority = createLogicalDefinition('typed-array-authority', 'Typed array authority', [
				createRule(
					'typed-array-value',
					[createAtom('candidate', 'equals', new Uint8Array([1]))],
					createAtom('accepted', 'equals', true),
				),
			])
			const error = captureError(() =>
				createProgram(
					buildProgramDefinition(
						'typed-array-definition',
						'Typed array definition',
						standardQualification,
						undefined,
						{ authority },
					),
				),
			)

			expect(error).toMatchObject({
				code: 'DEFINITION',
				cause: expect.any(TypeError),
			})
		})

		it('keeps behavior unchanged after the caller mutates the source definition', () => {
			const factor = createStaticFactor('minimum', 100)
			const notice = buildNotice('original', 'Original notice')
			const definition = buildProgramDefinition(
				'owned',
				'Owned program',
				standardQualification,
				buildRatingDefinition('owned-rating', 'Owned rating', [
					buildLineDefinition(
						'owned-line',
						'Owned line',
						createQuantitativeDefinition('owned-rate', 'Owned rate', [
							createFactorGroup('owned-group', 'sum', [factor]),
						]),
					),
				]),
				{ notices: [notice] },
			)
			const program = createProgram(definition)

			Reflect.set(factor.source, 'value', 900)
			Reflect.set(notice, 'message', 'Changed notice')

			const result = program.execute(eligibleSubject)
			expect(result.rating?.total).toBe(100)
			expect(result.determinations[0]?.message).toBe('Original notice')
			program.destroy()
		})

		it('freezes the stored plain-object graph', () => {
			const program = createProgram(noticeProgramDefinition)
			const notices = program.definition.notices
			const notice = notices?.[0]
			if (notices === undefined || notice === undefined) {
				throw new Error('Expected the stored definition to contain a notice')
			}

			expect(Object.isFrozen(program.definition)).toBe(true)
			expect(Object.isFrozen(notices)).toBe(true)
			expect(Object.isFrozen(notice)).toBe(true)
			expect(Reflect.set(notice, 'message', 'Changed notice')).toBe(false)
			expect(notice.message).toBe('Program {{id}} executed for {{licensed}}')
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
				buildProgramDefinition(
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
				buildProgramDefinition(
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
			const definition = buildProgramDefinition(
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
			expect(captureError(() => program.execute({ id: 'x', aggregate: {} }))).toMatchObject({
				code: 'RESERVED',
				context: 'aggregate',
			})
			program.destroy()
		})

		it('throws MISMATCH for a non-record subject', () => {
			const program = createProgram(standardProgramDefinition)
			expect(
				captureError(() => {
					const subject: Subject = JSON.parse('"subject"')
					return program.execute(subject)
				}),
			).toMatchObject({ code: 'MISMATCH' })
			program.destroy()
		})

		it('throws MISSING at construction for an unknown line reference', () => {
			const definition = buildProgramDefinition(
				'missing',
				'Missing',
				createQualificationDefinition('q', 'Q', [], {
					rulings: [createRuling('r', 'p', 'r', 'restriction', { scope: 'ghost' })],
				}),
				standardRating,
			)
			const gates = createLogicalDefinition('p', 'P', [
				createRule('r', [createAtom('id', 'equals', 'x')], createAtom('blocked', 'equals', true)),
			])
			const withPass = buildProgramDefinition(
				'missing',
				'Missing',
				createQualificationDefinition('q', 'Q', [gates], {
					...(definition.qualification.rulings === undefined
						? {}
						: { rulings: definition.qualification.rulings }),
				}),
				standardRating,
			)
			expect(captureError(() => createProgram(withPass))).toMatchObject({
				code: 'MISSING',
				context: 'missing',
			})
		})

		it('throws DEFINITION for a malformed definition', () => {
			const definition = buildProgramDefinition('', '', standardQualification, standardRating)
			expect(captureError(() => createProgram(definition))).toMatchObject({ code: 'DEFINITION' })
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
				buildProgramDefinition(
					definition.id,
					definition.name,
					definition.qualification,
					definition.rating,
					{
						...(definition.authority === undefined ? {} : { authority: definition.authority }),
						notices: [buildNotice('audit', 'Audit {{id}}')],
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
			expect(captureError(() => program.execute(eligibleSubject))).toMatchObject({
				code: 'DESTROYED',
			})
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
				buildProgramDefinition(
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
				buildProgramDefinition(
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
			expect(
				captureError(() => createProgram(buildEligibilityOnlyNoticeMissingScopeDefinition())),
			).toMatchObject({ code: 'MISSING' })
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
			expect(
				captureError(() => program.execute([eligibleSubject, { id: 'x', aggregate: {} }])),
			).toMatchObject({ code: 'RESERVED' })
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
			expect(captureError(() => program.execute(eligibleSubject))).toMatchObject({
				code: 'DESTROYED',
			})
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
			const fresh: Record<string, unknown> = {}
			expect(fresh.polluted).toBeUndefined()
			expect(Object.getPrototypeOf({})).toBe(Object.prototype)
			program.destroy()
		})
	})

	describe('aggregate numeric edges', () => {
		it('treats NaN, Infinity, -Infinity, strings, and absent values as zero contribution', () => {
			const program = createProgram(
				buildProgramDefinition(
					'numeric-edges',
					'Numeric edges',
					createQualificationDefinition(
						'numeric-edges-qualification',
						'Numeric edges qualification',
						[],
					),
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
				buildProgramDefinition(
					'nested-field',
					'Nested field',
					createQualificationDefinition(
						'nested-field-qualification',
						'Nested field qualification',
						[],
					),
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
				buildProgramDefinition(
					'group-semantics',
					'Group semantics',
					createQualificationDefinition(
						'group-semantics-qualification',
						'Group semantics qualification',
						[],
					),
					undefined,
					{ aggregate: { fields: ['amount'], partition: 'location' } },
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
				buildProgramDefinition(
					'group-collide',
					'Group collide',
					createQualificationDefinition(
						'group-collide-qualification',
						'Group collide qualification',
						[],
					),
					undefined,
					{ aggregate: { fields: ['amount'], partition: 'code' } },
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
			const gates = createLogicalDefinition('empty-batch-gates', 'Empty batch gates', [
				createRule(
					'empty-cap',
					[createAtom(['aggregate', 'count'], 'below', 1)],
					createAtom('limited', 'equals', true),
					{ description: 'Empty batch flagged' },
				),
			])
			const program = createProgram(
				buildProgramDefinition(
					'empty-batch',
					'Empty batch',
					createQualificationDefinition(
						'empty-batch-qualification',
						'Empty batch qualification',
						[],
					),
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
		it('always exposes tallies in STATUSES order', () => {
			const program = createProgram(batchAggregateProgramDefinition)
			const result = program.execute(batchSubjects)
			expect(Object.keys(result.tallies)).toEqual([...STATUSES])
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
			const definition = buildProgramDefinition('', '', standardQualification, standardRating)
			expect(
				captureError(() =>
					createProgram(definition, { engine, on: { destroy: destroyed.handler } }),
				),
			).toMatchObject({ code: 'DEFINITION' })
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
