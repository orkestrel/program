// The shared test infrastructure's own proof. `tests/setup.ts` is the fixture module every
// Vitest project of this workspace loads first, so its pinned qualifier/rater/engine doubles, its
// recorders, its malformed-result traps, and its whole program-definition corpus are the ground
// the `src:core` suites stand on. Each contract below is asserted against a hand-written
// expectation or against a second mechanism the module does not share — the real
// `@orkestrel/qualifier`, `@orkestrel/rater`, and `@orkestrel/reason` engines the definitions are
// authored for, the language's own own-key and prototype reads, a literal subject table — so a
// fixture that drifts cannot agree with itself here.
//
// `tests/setup.ts` is host-independent by construction: it imports no `node:*` module, no DOM,
// and no Vue. Its whole contract is therefore reachable in the Node `setup` project and no half
// of it is deferred to another suite.
//
// What this package DOES with these fixtures is proved by the suites that consume them. This file
// constructs a program only to mint a real event payload for the event recorder; it asserts no
// program outcome.

import type { LogicalDefinition, LogicalResult, ReasonResult, Subject } from '@orkestrel/reason'
import type { QualificationDefinition, QualificationResult } from '@orkestrel/qualifier'
import type { RatingDefinition, RatingResult } from '@orkestrel/rater'
import type { ProgramDefinition, Status } from '@src/core'
import { createQualifier, qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'
import { createRater } from '@orkestrel/rater'
import { createLogicalReasoner, createLogicalDefinition } from '@orkestrel/reason'
import { createProgram } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	allLinesScopedOutProgramDefinition,
	baseLine,
	batchAggregateProgramDefinition,
	batchSubjects,
	brokenAggregateGateProgramDefinition,
	brokenAuthorityProgramDefinition,
	buildAggregateGateProgram,
	buildAuthorityProgram,
	buildBrokenLogicalDefinition,
	buildCarrierProgram,
	buildEligibilityOnlyNoticeMissingScopeDefinition,
	buildHostileSubject,
	buildLargeBatch,
	cleanAuthority,
	cloneSubject,
	coastalReferralSubject,
	conditionalAuthority,
	conditionalProgramDefinition,
	conditionalSubject,
	createFixedEngine,
	createFixedQualifier,
	createFixedRater,
	createMalformedLogicalResult,
	createMalformedQualificationResult,
	createMalformedRatingResult,
	createQualificationResultClass,
	createQuantOnlyEngine,
	createRecordingEngine,
	createRecordingRater,
	createResultClass,
	eligibilityOnlyBatchSubjects,
	eligibilityOnlyConditionalProgramDefinition,
	eligibilityOnlyProgramDefinition,
	eligibilityOnlyReferralProgramDefinition,
	eligibilityOnlyWithAuthorityProgramDefinition,
	eligibleSubject,
	emptyCollectionsProgramDefinition,
	emptyLinesProgramDefinition,
	failedQualificationProgramDefinition,
	failedQualificationWithAuthorityProgramDefinition,
	frameSubject,
	ineligibleSubject,
	isBrowserVuePath,
	isSubjectArray,
	noticeProgramDefinition,
	recordEvents,
	referralProgramDefinition,
	referralSubject,
	scopedProgramDefinition,
	scopedReferralProgramDefinition,
	sharedIdBatchSubjects,
	standardProgramDefinition,
	standardQualification,
	standardRating,
	unratedAuthority,
	zeroPassQualification,
} from './setup.js'

/** Every `Status` the program layer can reach, written out rather than derived from the union. */
const STATUSES: readonly Status[] = ['ineligible', 'referral', 'conditional', 'unrated', 'eligible']

/** Qualify one subject through a real, owned qualifier — the second route to a fixture's claim. */
function qualifySubject(
	subject: Subject,
	definition: QualificationDefinition,
): QualificationResult {
	const qualifier = createQualifier()
	try {
		return qualifier.qualify(subject, definition)
	} finally {
		qualifier.destroy()
	}
}

/** Rate one subject through a real, owned rater — the second route to a rating fixture's claim. */
function rateSubject(definition: RatingDefinition, subject: Subject): RatingResult {
	const rater = createRater()
	try {
		return rater.rate(definition, subject)
	} finally {
		rater.destroy()
	}
}

/** Run one logical definition through the real logical reasoner, narrowed without a cast. */
function concludeLogical(subject: Subject, definition: LogicalDefinition): LogicalResult {
	const result: ReasonResult = createLogicalReasoner().reason(subject, definition)
	if (result.reasoning !== 'logical') {
		throw new Error(`Expected a logical result, got "${result.reasoning}"`)
	}
	return result
}

/** Read an authority's verdict for one program outcome status. */
function limitsStatus(definition: LogicalDefinition, status: Status): boolean {
	return concludeLogical({ outcome: { status } }, definition).conclusion
}

/** Read an aggregate gate's verdict for one summed portfolio amount. */
function limitsAmount(definition: LogicalDefinition, amount: number): boolean {
	return concludeLogical({ aggregate: { sums: { amount } } }, definition).conclusion
}

/** The `{{token}}` names one notice message interpolates. */
function collectPlaceholders(message: string): readonly string[] {
	return [...message.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '')
}

/** Every program definition the corpus exports as a value, for the corpus-wide invariants. */
function collectCorpusDefinitions(): readonly ProgramDefinition[] {
	return [
		allLinesScopedOutProgramDefinition,
		batchAggregateProgramDefinition,
		brokenAggregateGateProgramDefinition,
		brokenAuthorityProgramDefinition,
		conditionalProgramDefinition,
		eligibilityOnlyConditionalProgramDefinition,
		eligibilityOnlyProgramDefinition,
		eligibilityOnlyReferralProgramDefinition,
		eligibilityOnlyWithAuthorityProgramDefinition,
		emptyCollectionsProgramDefinition,
		emptyLinesProgramDefinition,
		failedQualificationProgramDefinition,
		failedQualificationWithAuthorityProgramDefinition,
		noticeProgramDefinition,
		referralProgramDefinition,
		scopedProgramDefinition,
		scopedReferralProgramDefinition,
		standardProgramDefinition,
		buildAggregateGateProgram(100),
		buildAuthorityProgram(cleanAuthority),
		buildCarrierProgram(),
		buildEligibilityOnlyNoticeMissingScopeDefinition(),
	]
}

describe('createFixedQualifier', () => {
	it('returns the pinned result whatever subject and definition it is handed', () => {
		const pinned = createMalformedQualificationResult()
		const qualifier = createFixedQualifier(pinned)

		expect(qualifier.qualify(eligibleSubject, standardQualification)).toBe(pinned)
		expect(qualifier.qualify(ineligibleSubject, zeroPassQualification)).toBe(pinned)
		qualifier.destroy()
	})

	it('delegates validation to a real qualifier, so a dangling ruling is still refused', () => {
		const qualifier = createFixedQualifier(createMalformedQualificationResult())
		const dangling = qualificationDefinition(
			'dangling',
			'Dangling',
			[...standardQualification.passes],
			{ rulings: [rulingDefinition('license', 'gates', 'absent', 'restriction')] },
		)

		expect(qualifier.validate(standardQualification).valid).toBe(true)
		expect(qualifier.validate(dangling).valid).toBe(false)
		expect(qualifier.validate(dangling).errors).toEqual([
			"Ruling 'license' references missing rule 'absent' in pass 'gates'",
		])
		qualifier.destroy()
	})

	it('owns the real qualifier it borrows its emitter from, and destroys it', () => {
		const qualifier = createFixedQualifier(createMalformedQualificationResult())

		expect(qualifier.emitter.destroyed).toBe(false)
		qualifier.destroy()
		expect(qualifier.emitter.destroyed).toBe(true)
	})
})

describe('createFixedRater', () => {
	it('returns the pinned result whatever lines and subject it is handed', () => {
		const pinned = createMalformedRatingResult()
		const rater = createFixedRater(pinned)

		expect(rater.rate(standardRating, eligibleSubject)).toBe(pinned)
		expect(rater.rate([], ineligibleSubject)).toBe(pinned)
		rater.destroy()
	})

	it('owns the real rater it borrows its emitter from, and destroys it', () => {
		const rater = createFixedRater(createMalformedRatingResult())

		expect(rater.emitter.destroyed).toBe(false)
		rater.destroy()
		expect(rater.emitter.destroyed).toBe(true)
	})
})

describe('createFixedEngine', () => {
	it('returns the pinned result for one subject and one per subject for a batch', () => {
		const pinned = createMalformedLogicalResult()
		const engine = createFixedEngine(pinned)

		expect(engine.reason(eligibleSubject, cleanAuthority)).toBe(pinned)
		expect(engine.reason([], cleanAuthority)).toEqual([])
		expect(engine.reason(batchSubjects, cleanAuthority)).toEqual([pinned, pinned, pinned])
		engine.destroy()
	})

	it('delegates every registry question to a real engine that ships with no reasoners', () => {
		const engine = createFixedEngine(createMalformedLogicalResult())

		expect(engine.reasoners()).toEqual([])
		expect(engine.supports('logical')).toBe(false)
		expect(engine.reasoner('logical')).toBeUndefined()
		expect(engine.validate(cleanAuthority).valid).toBe(false)
		expect(engine.validate(cleanAuthority).errors).toEqual([
			'No reasoner registered for reasoning "logical"',
		])
		engine.destroy()
	})

	it('registers a real reasoner into that engine, which then answers for its reasoning', () => {
		const engine = createFixedEngine(createMalformedLogicalResult())
		engine.register(createLogicalReasoner())

		expect(engine.reasoners().map((reasoner) => reasoner.reasoning)).toEqual(['logical'])
		expect(engine.supports('logical')).toBe(true)
		expect(engine.validate(cleanAuthority).valid).toBe(true)
		engine.destroy()
	})
})

describe('createRecordingRater', () => {
	it('records the lines and subject of each call, in call order', () => {
		const rater = createRecordingRater()
		rater.rate(standardRating, eligibleSubject)
		rater.rate([], ineligibleSubject)

		expect(rater.calls.map((call) => call.lines.map((line) => line.id))).toEqual([['base'], []])
		expect(rater.calls.map((call) => call.subject)).toEqual([eligibleSubject, ineligibleSubject])
		expect(rater.count).toBe(2)
		rater.destroy()
	})

	it('unwraps a rating definition, so both call forms record the same line shape', () => {
		const rater = createRecordingRater()
		rater.rate(standardRating, eligibleSubject)
		rater.rate([baseLine], eligibleSubject)

		expect(rater.calls.map((call) => call.lines)).toEqual([[baseLine], [baseLine]])
		rater.destroy()
	})

	it('returns the real rater result, so a recorded call is a rated call', () => {
		const rater = createRecordingRater()

		expect(rater.rate(standardRating, eligibleSubject).total).toBe(100)
		expect(rater.count).toBe(1)
		rater.destroy()
	})

	it('clears its record without detaching, so a later call still records', () => {
		const rater = createRecordingRater()
		rater.rate(standardRating, eligibleSubject)
		rater.clear()

		expect(rater.calls).toEqual([])
		expect(rater.count).toBe(0)
		rater.rate([], eligibleSubject)
		expect(rater.count).toBe(1)
		rater.destroy()
	})
})

describe('createRecordingEngine', () => {
	it('registers the quantitative and logical reasoners a program definition needs', () => {
		const engine = createRecordingEngine()

		expect(engine.reasoners().map((reasoner) => reasoner.reasoning)).toEqual([
			'quantitative',
			'logical',
		])
		expect(engine.validate(cleanAuthority).valid).toBe(true)
		engine.destroy()
	})

	it('counts every destroy, so a suite can prove an owned engine was released once', () => {
		const engine = createRecordingEngine()

		expect(engine.destroyCount).toBe(0)
		engine.destroy()
		expect(engine.destroyCount).toBe(1)
	})

	it('lets an option replace the default registry', () => {
		const engine = createRecordingEngine({ reasoners: [] })

		expect(engine.reasoners()).toEqual([])
		expect(engine.supports('quantitative')).toBe(false)
		engine.destroy()
	})

	it('reasons through the real engine, one result per subject of a batch', () => {
		const engine = createRecordingEngine()
		const results = engine.reason(batchSubjects, cleanAuthority)

		expect(results).toHaveLength(batchSubjects.length)
		expect(results.map((result) => result.success)).toEqual([true, true, true])
		engine.destroy()
	})
})

describe('createQuantOnlyEngine', () => {
	it('supports quantitative reasoning and refuses logical', () => {
		const engine = createQuantOnlyEngine()

		expect(engine.supports('quantitative')).toBe(true)
		expect(engine.supports('logical')).toBe(false)
		engine.destroy()
	})

	it('misses a logical definition through validate rather than throwing', () => {
		const engine = createQuantOnlyEngine()
		const validation = engine.validate(createLogicalDefinition('gates', 'Gates', []))

		expect(validation.valid).toBe(false)
		expect(validation.errors).toEqual(['No reasoner registered for reasoning "logical"'])
		engine.destroy()
	})
})

describe('recordEvents', () => {
	it('records every wired event name, in the order the emitter fired it', () => {
		const source = createProgram(batchAggregateProgramDefinition)
		const outcome = source.execute(eligibleSubject)
		const aggregate = source.execute(batchSubjects)
		source.destroy()
		const qualification = qualifySubject(eligibleSubject, standardQualification)
		const rating = rateSubject(standardRating, eligibleSubject)

		const program = createProgram(standardProgramDefinition)
		const recorder = recordEvents(program)
		expect(recorder.names).toEqual([])

		program.emitter.emit('aggregate', aggregate)
		program.emitter.emit('qualify', qualification)
		program.emitter.emit('determine', {
			id: 'audit',
			effect: 'notice',
			applied: true,
			premises: [],
		})
		program.emitter.emit('rate', rating)
		program.emitter.emit('decide', 'approved', outcome)
		program.emitter.emit('execute', outcome)
		program.destroy()

		expect(recorder.names).toEqual([
			'aggregate',
			'qualify',
			'determine',
			'rate',
			'decide',
			'execute',
			'destroy',
		])
	})

	it('clears its record without detaching, so a later event still records', () => {
		const program = createProgram(standardProgramDefinition)
		const recorder = recordEvents(program)
		program.emitter.emit('qualify', qualifySubject(eligibleSubject, standardQualification))
		recorder.clear()

		expect(recorder.names).toEqual([])
		program.destroy()
		expect(recorder.names).toEqual(['destroy'])
	})
})

describe('cloneSubject', () => {
	it('returns a distinct copy a mutation cannot reach the original through', () => {
		const clone = cloneSubject(eligibleSubject)

		expect(clone).not.toBe(eligibleSubject)
		expect(clone).toEqual(eligibleSubject)
		Reflect.set(clone, 'licensed', false)
		expect(eligibleSubject.licensed).toBe(true)
	})

	it('copies one level only, so a nested value stays shared', () => {
		const nested = { sums: { amount: 1 } }
		const subject: Subject = { id: 'nested', nested }

		expect(cloneSubject(subject).nested).toBe(nested)
	})
})

describe('isSubjectArray', () => {
	it('accepts an array of subjects and an empty array', () => {
		expect(isSubjectArray(batchSubjects)).toBe(true)
		expect(isSubjectArray([])).toBe(true)
	})

	it('refuses a lone subject and an array-like record', () => {
		expect(isSubjectArray(eligibleSubject)).toBe(false)
		expect(isSubjectArray({ length: 2, 0: eligibleSubject, 1: ineligibleSubject })).toBe(false)
	})
})

describe('buildHostileSubject', () => {
	it('carries prototype names as OWN keys, which an object literal cannot express', () => {
		const subject = buildHostileSubject()

		expect(Object.hasOwn(subject, '__proto__')).toBe(true)
		expect(Object.hasOwn(subject, 'constructor')).toBe(true)
		expect(Object.hasOwn({ __proto__: { polluted: true } }, '__proto__')).toBe(false)
	})

	it('leaves the prototype chain clean, so a suite reads a key rather than a pollution', () => {
		buildHostileSubject()

		expect(Object.getPrototypeOf(buildHostileSubject())).toBe(Object.prototype)
		expect(Reflect.get({}, 'polluted')).toBeUndefined()
	})

	it('returns a fresh subject each call, so one suite cannot reach the next', () => {
		expect(buildHostileSubject()).not.toBe(buildHostileSubject())
		expect(buildHostileSubject()).toEqual(buildHostileSubject())
	})
})

describe('buildLargeBatch', () => {
	it('builds exactly the requested count, down to an empty batch', () => {
		expect(buildLargeBatch(0)).toEqual([])
		expect(buildLargeBatch(64)).toHaveLength(64)
	})

	it('matches a hand-written table of the first four subjects', () => {
		expect(buildLargeBatch(4)).toEqual([
			{ id: 'bulk-0', licensed: true, amount: 0, location: 'east' },
			{ id: 'bulk-1', licensed: false, amount: 1, location: 'west' },
			{ id: 'bulk-2', licensed: true, amount: 2, location: 'west' },
			{ id: 'bulk-3', licensed: false, amount: 3, location: 'east' },
		])
	})

	it('gives every subject a distinct id and both eligibilities and both partitions', () => {
		const batch = buildLargeBatch(32)

		expect(new Set(batch.map((subject) => subject.id)).size).toBe(batch.length)
		expect(new Set(batch.map((subject) => subject.licensed))).toEqual(new Set([true, false]))
		expect(new Set(batch.map((subject) => subject.location))).toEqual(new Set(['east', 'west']))
	})
})

describe('the malformed result fixtures', () => {
	it('leave the required collection absent at runtime while the type declares it', () => {
		expect(createMalformedQualificationResult().scopes).toBeUndefined()
		expect(createMalformedRatingResult().lines).toBeUndefined()
		expect(createMalformedLogicalResult().rules).toBeUndefined()
	})

	it('report success, so a consumer checking success first still meets the gap', () => {
		expect(createMalformedQualificationResult().success).toBe(true)
		expect(createMalformedRatingResult().success).toBe(true)
		expect(createMalformedLogicalResult().success).toBe(true)
	})

	it('keep the discriminant a narrower reads, so the gap survives narrowing', () => {
		expect(createMalformedQualificationResult().eligibility).toBe('eligible')
		expect(createMalformedLogicalResult().reasoning).toBe('logical')
	})
})

describe('createQualificationResultClass', () => {
	it('reads through to the wrapped result and adds a property no declared field names', () => {
		const source = qualifySubject(ineligibleSubject, standardQualification)
		const wrapped = createQualificationResultClass(source)

		expect(wrapped.eligibility).toBe(source.eligibility)
		expect(wrapped.findings).toBe(source.findings)
		expect(wrapped.errors).toBe(source.errors)
		expect(Reflect.get(wrapped, 'extension')).toBe(true)
		expect(Reflect.get(source, 'extension')).toBeUndefined()
	})

	it('exposes nothing as an own key, so a structural copy loses the whole result', () => {
		const source = qualifySubject(eligibleSubject, standardQualification)
		const wrapped = createQualificationResultClass(source)

		expect(Object.keys(wrapped)).toEqual([])
		expect({ ...wrapped }).toEqual({})
		expect(Object.keys(source)).not.toEqual([])
	})
})

describe('createResultClass', () => {
	it('answers a property read while exposing no own key to a copy', () => {
		const wrapped = createResultClass({ id: 'risk-1', status: 'eligible' })

		expect(Reflect.get(wrapped, 'id')).toBe('risk-1')
		expect(Reflect.get(wrapped, 'status')).toBe('eligible')
		expect(Object.keys(wrapped)).toEqual([])
		expect(JSON.stringify(wrapped)).toBe('{}')
	})

	it('reads live through to the record, so a later write shows', () => {
		const record = { id: 'risk-1' }
		const wrapped = createResultClass(record)
		Reflect.set(record, 'id', 'risk-2')

		expect(Reflect.get(wrapped, 'id')).toBe('risk-2')
	})

	it('answers undefined for a declared name the record does not carry', () => {
		const wrapped = createResultClass({ id: 'risk-1' })

		expect(Reflect.get(wrapped, 'status')).toBeUndefined()
		expect(Reflect.get(wrapped, 'absent')).toBeUndefined()
	})
})

describe('the qualification fixtures', () => {
	it('pair each subject with the eligibility its name claims, under a real qualifier', () => {
		expect(qualifySubject(eligibleSubject, standardQualification).eligibility).toBe('eligible')
		expect(qualifySubject(ineligibleSubject, standardQualification).eligibility).toBe('ineligible')
		expect(
			qualifySubject(referralSubject, referralProgramDefinition.qualification).eligibility,
		).toBe('referral')
	})

	it('separate the standard and referral qualifications by effect alone', () => {
		const restriction = qualifySubject(ineligibleSubject, standardQualification)
		const referral = qualifySubject(referralSubject, referralProgramDefinition.qualification)

		expect(restriction.findings.map((finding) => finding.effect)).toEqual(['restriction'])
		expect(referral.findings.map((finding) => finding.effect)).toEqual(['referral'])
		expect(referral.findings.map((finding) => finding.rule)).toEqual(
			restriction.findings.map((finding) => finding.rule),
		)
	})

	it('apply the conditional fixture as a condition that leaves global eligibility standing', () => {
		const result = qualifySubject(conditionalSubject, conditionalProgramDefinition.qualification)

		expect(result.eligibility).toBe('eligible')
		expect(result.findings.map((finding) => [finding.effect, finding.applied])).toEqual([
			['condition', true],
		])
	})

	it('scope the property restriction to wind alone, leaving the subject globally eligible', () => {
		const result = qualifySubject(frameSubject, scopedProgramDefinition.qualification)

		expect(result.eligibility).toBe('eligible')
		expect(result.scopes).toEqual({ wind: 'ineligible' })
	})

	it('scope the coastal referral to wind alone', () => {
		const result = qualifySubject(
			coastalReferralSubject,
			scopedReferralProgramDefinition.qualification,
		)

		expect(result.eligibility).toBe('eligible')
		expect(result.scopes).toEqual({ wind: 'referral' })
	})

	it('leave every subject eligible under the zero-pass qualification, with no findings', () => {
		const eligible = qualifySubject(eligibleSubject, zeroPassQualification)
		const ineligible = qualifySubject(ineligibleSubject, zeroPassQualification)

		expect([eligible.eligibility, ineligible.eligibility]).toEqual(['eligible', 'eligible'])
		expect([eligible.findings, ineligible.findings]).toEqual([[], []])
		expect(eligible.trace).toEqual([])
	})

	it('fail the failing qualification operationally, and fail it closed to referral', () => {
		const result = qualifySubject(
			eligibleSubject,
			failedQualificationProgramDefinition.qualification,
		)

		expect(result.success).toBe(false)
		expect(result.eligibility).toBe('referral')
		expect(result.errors).toEqual(['failing-pass: Required factor "req" could not resolve source'])
	})
})

describe('the rating fixtures', () => {
	it('rate the standard rating to its one base line, at the same amount for any subject', () => {
		expect(standardRating.lines).toEqual([baseLine])
		expect(rateSubject(standardRating, eligibleSubject).total).toBe(100)
		expect(rateSubject(standardRating, ineligibleSubject).total).toBe(100)
	})

	it('give the property rating two lines a scope can tell apart', () => {
		const rating = scopedProgramDefinition.rating
		if (rating === undefined) throw new Error('The property program declares a rating')

		expect(rateSubject(rating, frameSubject).lines.map((line) => [line.id, line.amount])).toEqual([
			['wind', 50],
			['exWind', 75],
		])
	})

	it('separate an empty rating from an empty qualification', () => {
		const empty = emptyLinesProgramDefinition.rating
		if (empty === undefined) throw new Error('The empty-lines program declares a rating')

		expect(rateSubject(empty, eligibleSubject).lines).toEqual([])
		expect(emptyCollectionsProgramDefinition.rating).toBe(standardRating)
		expect(emptyLinesProgramDefinition.qualification.passes).toEqual([])
		expect(emptyCollectionsProgramDefinition.qualification.passes).toEqual([])
	})
})

describe('the authority fixtures', () => {
	it('limit a conditional outcome through the conditional authority and no other status', () => {
		expect(limitsStatus(conditionalAuthority, 'conditional')).toBe(true)
		expect(STATUSES.filter((status) => limitsStatus(conditionalAuthority, status))).toEqual([
			'conditional',
		])
	})

	it('limit an unrated outcome through the unrated authority and no other status', () => {
		expect(STATUSES.filter((status) => limitsStatus(unratedAuthority, status))).toEqual(['unrated'])
	})

	it('never limit through the clean authority, whatever the outcome status', () => {
		expect(STATUSES.filter((status) => limitsStatus(cleanAuthority, status))).toEqual([])
		expect(concludeLogical({ outcome: { status: 'eligible' } }, cleanAuthority).success).toBe(true)
	})

	it('attach a given authority to the standard pair, freshly on each call', () => {
		const program = buildAuthorityProgram(conditionalAuthority)

		expect(program.authority).toBe(conditionalAuthority)
		expect(program.qualification).toBe(standardQualification)
		expect(program.rating).toBe(standardRating)
		expect(buildAuthorityProgram(cleanAuthority)).not.toBe(buildAuthorityProgram(cleanAuthority))
	})
})

describe('buildBrokenLogicalDefinition', () => {
	it('fails a real reasoner without throwing, naming the premise-less rule', () => {
		const result = concludeLogical(eligibleSubject, buildBrokenLogicalDefinition('gates'))

		expect(result.success).toBe(false)
		expect(result.conclusion).toBe(false)
		expect(result.errors).toEqual(['Rule "gates-rule" has no premises — skipped'])
	})

	it('names its rule after the given id, so two broken fixtures never collide', () => {
		const authority = brokenAuthorityProgramDefinition.authority
		const gates = brokenAggregateGateProgramDefinition.aggregate?.gates
		if (authority === undefined || gates === undefined) {
			throw new Error('The broken programs declare an authority and aggregate gates')
		}

		expect(concludeLogical(eligibleSubject, authority).errors).toEqual([
			'Rule "broken-authority-gates-rule" has no premises — skipped',
		])
		expect(concludeLogical(eligibleSubject, gates).errors).toEqual([
			'Rule "broken-aggregate-gates-rule" has no premises — skipped',
		])
	})

	it('carries no rating on either broken program, so only the broken half can fail', () => {
		expect(brokenAuthorityProgramDefinition.rating).toBeUndefined()
		expect(brokenAggregateGateProgramDefinition.rating).toBeUndefined()
		expect(brokenAuthorityProgramDefinition.qualification).toBe(zeroPassQualification)
		expect(brokenAggregateGateProgramDefinition.qualification).toBe(zeroPassQualification)
	})
})

describe('buildAggregateGateProgram', () => {
	it('gates strictly above the given threshold', () => {
		const gates = buildAggregateGateProgram(100).aggregate?.gates
		if (gates === undefined) throw new Error('The aggregate-gate program declares gates')

		expect(limitsAmount(gates, 101)).toBe(true)
		expect(limitsAmount(gates, 100)).toBe(false)
		expect(limitsAmount(gates, 99)).toBe(false)
	})

	it('reads the summed portfolio field, not a top-level subject field', () => {
		const gates = buildAggregateGateProgram(100).aggregate?.gates
		if (gates === undefined) throw new Error('The aggregate-gate program declares gates')

		expect(concludeLogical({ amount: 500 }, gates).conclusion).toBe(false)
		expect(limitsAmount(gates, 500)).toBe(true)
	})

	it('declares the one field its gate reads, and rates through the standard pair', () => {
		const program = buildAggregateGateProgram(100)

		expect(program.aggregate?.fields).toEqual(['amount'])
		expect(program.aggregate?.by).toBeUndefined()
		expect(program.qualification).toBe(standardQualification)
		expect(program.rating).toBe(standardRating)
	})
})

describe('the batch fixtures', () => {
	it('partition the batch program by location and sum its amount', () => {
		expect(batchAggregateProgramDefinition.aggregate?.fields).toEqual(['amount'])
		expect(batchAggregateProgramDefinition.aggregate?.by).toBe('location')
		expect(batchAggregateProgramDefinition.aggregate?.gates).toBeUndefined()
	})

	it('split the batch subjects into an east pair and a west single', () => {
		expect(batchSubjects).toEqual([
			{ id: 'a', licensed: true, amount: 10, location: 'east' },
			{ id: 'b', licensed: false, amount: 20, location: 'west' },
			{ id: 'c', licensed: true, amount: 30, location: 'east' },
		])
	})

	it('carry a licensed and an unlicensed subject, so a batch tallies more than one status', () => {
		expect(
			batchSubjects.map((subject) => qualifySubject(subject, standardQualification).eligibility),
		).toEqual(['eligible', 'ineligible', 'eligible'])
	})

	it('repeat one id across the shared-id pair while their eligibilities differ', () => {
		expect(new Set(sharedIdBatchSubjects.map((subject) => subject.id))).toEqual(new Set(['shared']))
		expect(
			sharedIdBatchSubjects.map(
				(subject) => qualifySubject(subject, standardQualification).eligibility,
			),
		).toEqual(['eligible', 'ineligible'])
	})

	it('pair an eligible with an ineligible subject in the eligibility-only batch', () => {
		expect(eligibilityOnlyBatchSubjects).toEqual([eligibleSubject, ineligibleSubject])
	})
})

describe('the eligibility-only fixtures', () => {
	it('omit the rating, so the rater is never reached', () => {
		expect(eligibilityOnlyProgramDefinition.rating).toBeUndefined()
		expect(eligibilityOnlyConditionalProgramDefinition.rating).toBeUndefined()
		expect(eligibilityOnlyReferralProgramDefinition.rating).toBeUndefined()
		expect(eligibilityOnlyWithAuthorityProgramDefinition.rating).toBeUndefined()
	})

	it('reuse the qualification of the rated program each one mirrors, by identity', () => {
		expect(eligibilityOnlyProgramDefinition.qualification).toBe(standardQualification)
		expect(eligibilityOnlyConditionalProgramDefinition.qualification).toBe(
			conditionalProgramDefinition.qualification,
		)
		expect(eligibilityOnlyReferralProgramDefinition.qualification).toBe(
			referralProgramDefinition.qualification,
		)
	})

	it('add the clean authority and nothing else to the authority-carrying one', () => {
		expect(eligibilityOnlyWithAuthorityProgramDefinition.authority).toBe(cleanAuthority)
		expect(eligibilityOnlyWithAuthorityProgramDefinition.qualification).toBe(standardQualification)
		expect(eligibilityOnlyProgramDefinition.authority).toBeUndefined()
	})

	it('scope the missing-scope notice to a line no rating declares, freshly on each call', () => {
		const definition = buildEligibilityOnlyNoticeMissingScopeDefinition()
		const scopes = (definition.notices ?? []).map((notice) => notice.scope)

		expect(definition.rating).toBeUndefined()
		expect(scopes).toEqual(['base'])
		expect(definition).not.toBe(buildEligibilityOnlyNoticeMissingScopeDefinition())
	})
})

describe('the notice fixtures', () => {
	it('interpolate only field names the eligible subject carries', () => {
		const messages = (noticeProgramDefinition.notices ?? []).map((notice) => notice.message)
		const placeholders = messages.flatMap((message) => collectPlaceholders(message))

		expect(placeholders).not.toEqual([])
		expect(placeholders.filter((name) => !Object.hasOwn(eligibleSubject, name))).toEqual([])
	})

	it('differ from the standard program by their notices alone', () => {
		expect(noticeProgramDefinition.qualification).toBe(standardQualification)
		expect(noticeProgramDefinition.rating).toBe(standardRating)
		expect(standardProgramDefinition.notices).toBeUndefined()
		expect(noticeProgramDefinition.notices).toEqual([
			{ id: 'rated', message: 'Program {{id}} executed for {{licensed}}' },
		])
	})
})

describe('buildCarrierProgram', () => {
	it('returns a fresh, equal graph on every call', () => {
		const first = buildCarrierProgram()
		const second = buildCarrierProgram()

		expect(first).not.toBe(second)
		expect(first.qualification).not.toBe(second.qualification)
		expect(first).toEqual(second)
	})

	it('is self-contained: its own gates, its own line, and the shared clean authority', () => {
		const program = buildCarrierProgram()
		const rating = program.rating
		if (rating === undefined) throw new Error('The carrier program declares a rating')

		expect(program.qualification).not.toBe(standardQualification)
		expect(rating).not.toBe(standardRating)
		expect(program.authority).toBe(cleanAuthority)
		expect(qualifySubject(ineligibleSubject, program.qualification).eligibility).toBe('ineligible')
		expect(rateSubject(rating, eligibleSubject).total).toBe(10)
	})

	it('interpolates only field names the eligible subject carries', () => {
		const placeholders = (buildCarrierProgram().notices ?? []).flatMap((notice) =>
			collectPlaceholders(notice.message),
		)

		expect(placeholders).toEqual(['id'])
		expect(placeholders.filter((name) => !Object.hasOwn(eligibleSubject, name))).toEqual([])
	})
})

describe('the corpus definitions', () => {
	it('name a pass and a rule every ruling can reach, so a real qualifier validates each one', () => {
		const definitions = collectCorpusDefinitions()
		const qualifier = createQualifier()
		try {
			const refused = definitions
				.filter((definition) => !qualifier.validate(definition.qualification).valid)
				.map((definition) => definition.id)

			expect(definitions).not.toEqual([])
			expect(refused).toEqual([])
		} finally {
			qualifier.destroy()
		}
	})

	it('scope every scoped ruling to a line the paired rating declares', () => {
		const orphans = collectCorpusDefinitions().flatMap((definition) => {
			const lines = (definition.rating?.lines ?? []).map((line) => line.id)
			return (definition.qualification.rulings ?? [])
				.filter((ruling) => ruling.scope !== undefined && !lines.includes(ruling.scope))
				.map((ruling) => `${definition.id}: ${ruling.id}`)
		})

		expect(orphans).toEqual([])
	})

	it('mirror the failing program exactly when adding the clean authority to it', () => {
		expect(failedQualificationWithAuthorityProgramDefinition.id).toBe(
			failedQualificationProgramDefinition.id,
		)
		expect(failedQualificationWithAuthorityProgramDefinition.qualification).toBe(
			failedQualificationProgramDefinition.qualification,
		)
		expect(failedQualificationWithAuthorityProgramDefinition.rating).toBe(
			failedQualificationProgramDefinition.rating,
		)
		expect(failedQualificationWithAuthorityProgramDefinition.authority).toBe(cleanAuthority)
		expect(failedQualificationProgramDefinition.authority).toBeUndefined()
	})

	it('scope a restriction over every line the all-scoped rating declares', () => {
		const definition = allLinesScopedOutProgramDefinition
		const lines = (definition.rating?.lines ?? []).map((line) => line.id)
		const scopes = (definition.qualification.rulings ?? []).map((ruling) => ruling.scope)

		expect(lines).toEqual(['wind', 'exWind'])
		expect(new Set(scopes)).toEqual(new Set(lines))
		expect(qualifySubject(frameSubject, definition.qualification).scopes).toEqual({
			wind: 'ineligible',
			exWind: 'ineligible',
		})
	})
})

describe('isBrowserVuePath', () => {
	it('accepts a browser component path written with either separator family', () => {
		expect(isBrowserVuePath('app/browser/views/Home.vue')).toBe(true)
		expect(isBrowserVuePath('app\\browser\\views\\Home.vue')).toBe(true)
	})

	it('refuses a sibling environment, a prefix lookalike, and a nested repeat', () => {
		expect(isBrowserVuePath('app/server/views/Home.vue')).toBe(false)
		expect(isBrowserVuePath('app/browserless/views/Home.vue')).toBe(false)
		expect(isBrowserVuePath('src/app/browser/views/Home.vue')).toBe(false)
	})
})
