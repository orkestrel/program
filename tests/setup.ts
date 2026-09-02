import type { LineDefinition, RatingResult, RaterInterface, RaterOptions } from '@orkestrel/rater'
import type { QualificationResult, QualifierInterface } from '@orkestrel/qualifier'
import type {
	Definition,
	LogicalDefinition,
	LogicalResult,
	ReasonInterface,
	ReasonOptions,
	ReasonResult,
	ReasonerInterface,
	Reasoning,
	Subject,
} from '@orkestrel/reason'
import type { ProgramDefinition, ProgramEventMap, ProgramInterface } from '@src/core'
import { createQualifier, qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'
import { createRater, isRatingDefinition, lineDefinition, ratingDefinition } from '@orkestrel/rater'
import {
	createAtom,
	createFactorGroup,
	createFieldFactor,
	createLogicalDefinition,
	createLogicalReasoner,
	createQuantitativeDefinition,
	createQuantitativeReasoner,
	createReason,
	createRule,
	createStaticFactor,
} from '@orkestrel/reason'
import { buildAggregateDefinition, buildNotice, buildProgramDefinition } from '@src/core'

class FixedReason implements ReasonInterface {
	readonly #inner: ReasonInterface
	readonly #result: ReasonResult

	constructor(result: ReasonResult) {
		this.#inner = createReason()
		this.#result = result
	}

	get emitter() {
		return this.#inner.emitter
	}

	reason(subjects: readonly Subject[], definition: Definition): readonly ReasonResult[]
	reason(subject: Subject, definition: Definition): ReasonResult
	reason(
		subjectsOrSubject: readonly Subject[] | Subject,
		_definition: Definition,
	): readonly ReasonResult[] | ReasonResult {
		if (isSubjectArray(subjectsOrSubject)) {
			return subjectsOrSubject.map(() => this.#result)
		}
		return this.#result
	}

	register(reasoner: ReasonerInterface): void {
		this.#inner.register(reasoner)
	}

	reasoner(reasoning: Reasoning): ReasonerInterface | undefined {
		return this.#inner.reasoner(reasoning)
	}

	reasoners(): readonly ReasonerInterface[] {
		return this.#inner.reasoners()
	}

	supports(reasoning: Reasoning): boolean {
		return this.#inner.supports(reasoning)
	}

	validate(definition: Definition) {
		return this.#inner.validate(definition)
	}

	destroy(): void {
		this.#inner.destroy()
	}
}

class QualificationResultClass implements QualificationResult {
	readonly #result: QualificationResult

	constructor(result: QualificationResult) {
		this.#result = result
	}

	get id() {
		return this.#result.id
	}

	get name() {
		return this.#result.name
	}

	get eligibility() {
		return this.#result.eligibility
	}

	get scopes() {
		return this.#result.scopes
	}

	get findings() {
		return this.#result.findings
	}

	get derivations() {
		return this.#result.derivations
	}

	get success() {
		return this.#result.success
	}

	get trace() {
		return this.#result.trace
	}

	get errors() {
		return this.#result.errors
	}

	get extension(): boolean {
		return true
	}
}

class MalformedQualificationResult implements QualificationResult {
	get id(): string {
		return 'malformed-qualification'
	}

	get name(): string {
		return 'Malformed qualification'
	}

	get eligibility(): 'eligible' {
		return 'eligible'
	}

	get scopes(): QualificationResult['scopes'] {
		return structuredClone(this).scopes
	}

	get findings(): QualificationResult['findings'] {
		return []
	}

	get derivations(): QualificationResult['derivations'] {
		return []
	}

	get success(): boolean {
		return true
	}

	get trace(): readonly string[] {
		return []
	}

	get errors(): readonly string[] {
		return []
	}
}

class MalformedRatingResult implements RatingResult {
	get lines(): RatingResult['lines'] {
		return structuredClone(this).lines
	}

	get success(): boolean {
		return true
	}
}

class MalformedLogicalResult implements LogicalResult {
	get reasoning(): 'logical' {
		return 'logical'
	}

	get conclusion(): boolean {
		return false
	}

	get rules(): LogicalResult['rules'] {
		return structuredClone(this).rules
	}

	get count(): number {
		return 0
	}

	get success(): boolean {
		return true
	}

	get trace(): readonly string[] {
		return []
	}

	get errors(): readonly string[] {
		return []
	}
}

class ResultClass {
	readonly #record: object

	constructor(record: object) {
		this.#record = record
	}

	get id(): unknown {
		return Reflect.get(this.#record, 'id')
	}

	get name(): unknown {
		return Reflect.get(this.#record, 'name')
	}

	get key(): unknown {
		return Reflect.get(this.#record, 'key')
	}

	get count(): unknown {
		return Reflect.get(this.#record, 'count')
	}

	get sums(): unknown {
		return Reflect.get(this.#record, 'sums')
	}

	get effect(): unknown {
		return Reflect.get(this.#record, 'effect')
	}

	get applied(): unknown {
		return Reflect.get(this.#record, 'applied')
	}

	get scope(): unknown {
		return Reflect.get(this.#record, 'scope')
	}

	get message(): unknown {
		return Reflect.get(this.#record, 'message')
	}

	get premises(): unknown {
		return Reflect.get(this.#record, 'premises')
	}

	get eligibility(): unknown {
		return Reflect.get(this.#record, 'eligibility')
	}

	get status(): unknown {
		return Reflect.get(this.#record, 'status')
	}

	get ineligible(): unknown {
		return Reflect.get(this.#record, 'ineligible')
	}

	get referral(): unknown {
		return Reflect.get(this.#record, 'referral')
	}

	get conditional(): unknown {
		return Reflect.get(this.#record, 'conditional')
	}

	get unrated(): unknown {
		return Reflect.get(this.#record, 'unrated')
	}

	get eligible(): unknown {
		return Reflect.get(this.#record, 'eligible')
	}

	get decision(): unknown {
		return Reflect.get(this.#record, 'decision')
	}

	get qualification(): unknown {
		return Reflect.get(this.#record, 'qualification')
	}

	get rating(): unknown {
		return Reflect.get(this.#record, 'rating')
	}

	get determinations(): unknown {
		return Reflect.get(this.#record, 'determinations')
	}

	get success(): unknown {
		return Reflect.get(this.#record, 'success')
	}

	get trace(): unknown {
		return Reflect.get(this.#record, 'trace')
	}

	get errors(): unknown {
		return Reflect.get(this.#record, 'errors')
	}

	get subjects(): unknown {
		return Reflect.get(this.#record, 'subjects')
	}

	get groups(): unknown {
		return Reflect.get(this.#record, 'groups')
	}

	get tallies(): unknown {
		return Reflect.get(this.#record, 'tallies')
	}

	get valid(): unknown {
		return Reflect.get(this.#record, 'valid')
	}

	get warnings(): unknown {
		return Reflect.get(this.#record, 'warnings')
	}
}

export function createFixedQualifier(result: QualificationResult): QualifierInterface {
	const inner = createQualifier()
	return {
		get emitter() {
			return inner.emitter
		},
		qualify() {
			return result
		},
		validate(definition) {
			return inner.validate(definition)
		},
		destroy() {
			inner.destroy()
		},
	}
}

export function createFixedRater(result: RatingResult): RaterInterface {
	const inner = createRater()
	return {
		get emitter() {
			return inner.emitter
		},
		rate() {
			return result
		},
		destroy() {
			inner.destroy()
		},
	}
}

export function createFixedEngine(result: ReasonResult): ReasonInterface {
	return new FixedReason(result)
}

export function createQualificationResultClass(result: QualificationResult): QualificationResult {
	return new QualificationResultClass(result)
}

export function createMalformedQualificationResult(): QualificationResult {
	return new MalformedQualificationResult()
}

export function createMalformedRatingResult(): RatingResult {
	return new MalformedRatingResult()
}

export function createMalformedLogicalResult(): LogicalResult {
	return new MalformedLogicalResult()
}

export function createResultClass(record: object): object {
	return new ResultClass(record)
}

export interface RecordingRaterCall {
	readonly lines: readonly LineDefinition[]
	readonly subject: Subject
}

export interface RecordingRaterInterface extends RaterInterface {
	readonly calls: readonly RecordingRaterCall[]
	readonly count: number
	clear(): void
}

export function createRecordingRater(options?: RaterOptions): RecordingRaterInterface {
	const inner = createRater(options)
	const calls: RecordingRaterCall[] = []
	return {
		get emitter() {
			return inner.emitter
		},
		get calls() {
			return calls
		},
		get count() {
			return calls.length
		},
		clear() {
			calls.length = 0
		},
		rate(linesOrDefinition, subject) {
			if (isRatingDefinition(linesOrDefinition)) {
				calls.push({ lines: linesOrDefinition.lines, subject })
				return inner.rate(linesOrDefinition, subject)
			}
			calls.push({ lines: linesOrDefinition, subject })
			return inner.rate(linesOrDefinition, subject)
		},
		destroy() {
			inner.destroy()
		},
	}
}

export function isSubjectArray(value: unknown): value is readonly Subject[] {
	return Array.isArray(value)
}

export interface RecordingEngineInterface extends ReasonInterface {
	readonly destroyCount: number
}

export function createRecordingEngine(options?: ReasonOptions): RecordingEngineInterface {
	const inner = createReason({
		reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
		bail: false,
		...options,
	})
	let destroyCount = 0

	function reason(subjects: readonly Subject[], definition: Definition): readonly ReasonResult[]
	function reason(subject: Subject, definition: Definition): ReasonResult
	function reason(
		subjectsOrSubject: readonly Subject[] | Subject,
		definition: Definition,
	): readonly ReasonResult[] | ReasonResult {
		if (isSubjectArray(subjectsOrSubject)) {
			return inner.reason(subjectsOrSubject, definition)
		}
		return inner.reason(subjectsOrSubject, definition)
	}

	return {
		get emitter() {
			return inner.emitter
		},
		reason,
		register(reasoner) {
			inner.register(reasoner)
		},
		reasoner(reasoning) {
			return inner.reasoner(reasoning)
		},
		reasoners() {
			return inner.reasoners()
		},
		supports(reasoning) {
			return inner.supports(reasoning)
		},
		validate(definition) {
			return inner.validate(definition)
		},
		destroy() {
			destroyCount += 1
			inner.destroy()
		},
		get destroyCount() {
			return destroyCount
		},
	}
}

export interface EventRecorderInterface {
	readonly names: ReadonlyArray<keyof ProgramEventMap>
	clear(): void
}

export function recordEvents(program: ProgramInterface): EventRecorderInterface {
	const names: Array<keyof ProgramEventMap> = []
	const record = (name: keyof ProgramEventMap) => {
		names.push(name)
	}
	program.emitter.on('qualify', () => record('qualify'))
	program.emitter.on('rate', () => record('rate'))
	program.emitter.on('determine', () => record('determine'))
	program.emitter.on('decide', () => record('decide'))
	program.emitter.on('execute', () => record('execute'))
	program.emitter.on('aggregate', () => record('aggregate'))
	program.emitter.on('destroy', () => record('destroy'))
	return {
		get names() {
			return names
		},
		clear() {
			names.length = 0
		},
	}
}

const licensedGates = createLogicalDefinition('gates', 'Eligibility gates', [
	createRule(
		'licensed',
		[createAtom('licensed', 'equals', false)],
		createAtom('blocked', 'equals', true),
	),
])

export const baseRate = createQuantitativeDefinition('base-rate', 'Base rate', [
	createFactorGroup('amount', 'sum', [createStaticFactor('minimum', 100)]),
])

export const baseLine = lineDefinition('base', 'Base premium', baseRate)

export const standardRating = ratingDefinition('standard-rating', 'Standard rating', [baseLine])

export const standardQualification = qualificationDefinition(
	'standard-qualification',
	'Standard qualification',
	[licensedGates],
	{
		rulings: [
			rulingDefinition('license', 'gates', 'licensed', 'restriction', {
				message: 'A license is required',
			}),
		],
	},
)

export const standardProgramDefinition = buildProgramDefinition(
	'standard',
	'Standard program',
	standardQualification,
	standardRating,
)

export const eligibleSubject: Subject = { id: 'risk-eligible', licensed: true }

export const ineligibleSubject: Subject = { id: 'risk-ineligible', licensed: false }

const referralQualification = qualificationDefinition(
	'referral-qualification',
	'Referral qualification',
	[licensedGates],
	{
		rulings: [
			rulingDefinition('review', 'gates', 'licensed', 'referral', {
				message: 'Underwriter review required',
			}),
		],
	},
)

export const referralProgramDefinition = buildProgramDefinition(
	'referral',
	'Referral program',
	referralQualification,
	standardRating,
)

export const referralSubject: Subject = { id: 'risk-referral', licensed: false }

const windGates = createLogicalDefinition('wind-gates', 'Wind gates', [
	createRule(
		'frame',
		[createAtom('construction', 'equals', 'Frame')],
		createAtom('frame', 'equals', true),
	),
])

const windRate = createQuantitativeDefinition('wind-rate', 'Wind rate', [
	createFactorGroup('wind', 'sum', [createStaticFactor('flat', 50)]),
])

const exWindRate = createQuantitativeDefinition('ex-wind-rate', 'Ex-wind rate', [
	createFactorGroup('ex-wind', 'sum', [createStaticFactor('flat', 75)]),
])

export const scopedProgramDefinition = buildProgramDefinition(
	'property',
	'Property program',
	qualificationDefinition('property-qualification', 'Property qualification', [windGates], {
		rulings: [
			rulingDefinition('frame', 'wind-gates', 'frame', 'restriction', {
				scope: 'wind',
				message: 'Wind is unavailable for Frame construction',
			}),
		],
	}),
	ratingDefinition('property-rating', 'Property rating', [
		lineDefinition('wind', 'Wind', windRate),
		lineDefinition('exWind', 'Ex-Wind', exWindRate),
	]),
)

export const frameSubject: Subject = { id: 'risk-frame', construction: 'Frame' }

const coastalGates = createLogicalDefinition('coastal-gates', 'Coastal gates', [
	createRule(
		'coastal',
		[createAtom('location', 'equals', 'coastal')],
		createAtom('coastal', 'equals', true),
	),
])

export const coastalReferralSubject: Subject = { id: 'risk-coastal', location: 'coastal' }

const failingPass = createQuantitativeDefinition('failing-pass', 'Failing pass', [
	createFactorGroup('g', 'sum', [createFieldFactor('req', ['missing'], { required: true })], {
		strict: true,
	}),
])

export const failedQualificationProgramDefinition = buildProgramDefinition(
	'failed-qualification',
	'Failed qualification program',
	qualificationDefinition('failed-qualification', 'Failed qualification', [failingPass]),
	standardRating,
)

const conditionalGates = createLogicalDefinition('conditional-gates', 'Conditional gates', [
	createRule(
		'present',
		[createAtom('id', 'equals', 'risk-conditional')],
		createAtom('flag', 'equals', true),
	),
])

const conditionalQualification = qualificationDefinition(
	'conditional-qualification',
	'Conditional qualification',
	[conditionalGates],
	{
		rulings: [
			rulingDefinition('protective-device', 'conditional-gates', 'present', 'condition', {
				message: 'Install an approved protective device',
			}),
		],
	},
)

export const conditionalProgramDefinition = buildProgramDefinition(
	'conditional',
	'Conditional program',
	conditionalQualification,
	standardRating,
)

export const conditionalSubject: Subject = { id: 'risk-conditional' }

export const emptyLinesProgramDefinition = buildProgramDefinition(
	'empty-lines',
	'Empty lines program',
	qualificationDefinition('empty-qualification', 'Empty qualification', []),
	ratingDefinition('empty-rating', 'Empty rating', []),
)

export const emptyCollectionsProgramDefinition = buildProgramDefinition(
	'empty-collections',
	'Empty collections program',
	qualificationDefinition('bare-qualification', 'Bare qualification', []),
	standardRating,
)

export const noticeProgramDefinition = buildProgramDefinition(
	'noticed',
	'Noticed program',
	standardQualification,
	standardRating,
	{
		notices: [buildNotice('rated', 'Program {{id}} executed for {{licensed}}')],
	},
)

export function buildAuthorityProgram(authority: LogicalDefinition): ProgramDefinition {
	return buildProgramDefinition(
		'authority',
		'Authority program',
		standardQualification,
		standardRating,
		{
			authority,
		},
	)
}

export const conditionalAuthority = createLogicalDefinition('authority', 'Final authority', [
	createRule(
		'manual',
		[createAtom(['outcome', 'status'], 'equals', 'conditional')],
		createAtom('limited', 'equals', true),
		{
			name: 'Manual authority required',
			description: 'Conditional outcomes require manual authority',
		},
	),
])

export const cleanAuthority = createLogicalDefinition('authority', 'Clean authority', [
	createRule(
		'never',
		[createAtom('blocked', 'equals', true)],
		createAtom('limited', 'equals', true),
	),
])

export const scopedReferralProgramDefinition = buildProgramDefinition(
	'scoped-referral',
	'Scoped referral program',
	qualificationDefinition(
		'scoped-referral-qualification',
		'Scoped referral qualification',
		[coastalGates],
		{
			rulings: [
				rulingDefinition('coastal-review', 'coastal-gates', 'coastal', 'referral', {
					scope: 'wind',
					message: 'Wind requires underwriter review',
				}),
			],
		},
	),
	ratingDefinition('scoped-referral-rating', 'Scoped referral rating', [
		lineDefinition('wind', 'Wind', windRate),
		lineDefinition('exWind', 'Ex-Wind', exWindRate),
	]),
	{ authority: cleanAuthority },
)

export const unratedAuthority = createLogicalDefinition('authority', 'Unrated authority', [
	createRule(
		'unrated-cap',
		[createAtom(['outcome', 'status'], 'equals', 'unrated')],
		createAtom('limited', 'equals', true),
		{ description: 'Unrated outcomes require manual review' },
	),
])

export const batchAggregateProgramDefinition = buildProgramDefinition(
	'batch',
	'Batch program',
	standardQualification,
	standardRating,
	{
		aggregate: buildAggregateDefinition(['amount'], { by: 'location' }),
	},
)

export const batchSubjects: Subject[] = [
	{ id: 'a', licensed: true, amount: 10, location: 'east' },
	{ id: 'b', licensed: false, amount: 20, location: 'west' },
	{ id: 'c', licensed: true, amount: 30, location: 'east' },
]

export function buildAggregateGateProgram(threshold: number): ProgramDefinition {
	const gates = createLogicalDefinition('batch-gates', 'Batch gates', [
		createRule(
			'portfolio-cap',
			[createAtom(['aggregate', 'sums', 'amount'], 'above', threshold)],
			createAtom('limited', 'equals', true),
			{ description: 'Portfolio cap exceeded' },
		),
	])
	return buildProgramDefinition(
		'aggregate-gate',
		'Aggregate gate program',
		standardQualification,
		standardRating,
		{
			aggregate: buildAggregateDefinition(['amount'], { gates }),
		},
	)
}

export function buildCarrierProgram(): ProgramDefinition {
	const gates = createLogicalDefinition('carrier-gates', 'Carrier gates', [
		createRule(
			'licensed',
			[createAtom('licensed', 'equals', false)],
			createAtom('blocked', 'equals', true),
		),
	])

	const amountRate = createQuantitativeDefinition('amount-rate', 'Amount rate', [
		createFactorGroup('amount', 'sum', [createStaticFactor('flat', 10)]),
	])

	const qualification = qualificationDefinition(
		'carrier-qualification',
		'Carrier qualification',
		[gates],
		{
			rulings: [
				rulingDefinition('license', 'carrier-gates', 'licensed', 'restriction', {
					message: 'License required',
				}),
			],
		},
	)

	const rating = ratingDefinition('carrier-rating', 'Carrier rating', [
		lineDefinition('premium', 'Premium', amountRate),
	])

	return buildProgramDefinition('carrier', 'Carrier program', qualification, rating, {
		notices: [buildNotice('audit', 'Carrier audit for {{id}}')],
		authority: cleanAuthority,
	})
}

export function cloneSubject(subject: Subject): Subject {
	return { ...subject }
}

/**
 * Create a reason engine registering ONLY the quantitative reasoner — used to
 * exercise a `'logical'`-reasoning validation path with no logical reasoner
 * registered (a safe, non-throwing `engine.validate()` miss).
 */
export function createQuantOnlyEngine(options?: ReasonOptions): ReasonInterface {
	return createReason({ reasoners: [createQuantitativeReasoner()], ...options, bail: false })
}

/**
 * Build a logical definition with a single premise-less rule.
 *
 * @remarks
 * A premise-less rule never applies but is a genuine, non-throwing
 * `LogicalReasoner` execution failure — `reason()` returns
 * `success: false` with a `"has no premises — skipped"` error entry. Used to
 * exercise gate/authority error propagation without a technical (thrown)
 * failure.
 */
export function buildBrokenLogicalDefinition(id: string): LogicalDefinition {
	return createLogicalDefinition(id, 'Broken definition', [
		createRule(`${id}-rule`, [], createAtom('limited', 'equals', true)),
	])
}

export const zeroPassQualification = qualificationDefinition(
	'zero-pass-qualification',
	'Zero pass qualification',
	[],
)

export const brokenAggregateGateProgramDefinition = buildProgramDefinition(
	'broken-aggregate-gate',
	'Broken aggregate gate program',
	zeroPassQualification,
	undefined,
	{
		aggregate: buildAggregateDefinition(['amount'], {
			gates: buildBrokenLogicalDefinition('broken-aggregate-gates'),
		}),
	},
)

export const brokenAuthorityProgramDefinition = buildProgramDefinition(
	'broken-authority',
	'Broken authority program',
	zeroPassQualification,
	undefined,
	{ authority: buildBrokenLogicalDefinition('broken-authority-gates') },
)

/** An eligibility-only definition (no `rating`) reusing the standard qualification. */
export const eligibilityOnlyProgramDefinition = buildProgramDefinition(
	'eligibility-only',
	'Eligibility-only program',
	standardQualification,
)

/** An eligibility-only definition reusing the conditional qualification. */
export const eligibilityOnlyConditionalProgramDefinition = buildProgramDefinition(
	'eligibility-only-conditional',
	'Eligibility-only conditional program',
	conditionalProgramDefinition.qualification,
)

/** An eligibility-only definition reusing the referral qualification. */
export const eligibilityOnlyReferralProgramDefinition = buildProgramDefinition(
	'eligibility-only-referral',
	'Eligibility-only referral program',
	referralProgramDefinition.qualification,
)

/** An eligibility-only definition with a clean authority. */
export const eligibilityOnlyWithAuthorityProgramDefinition = buildProgramDefinition(
	'eligibility-only-authority',
	'Eligibility-only authority program',
	standardQualification,
	undefined,
	{ authority: cleanAuthority },
)

/** An eligibility-only definition with a notice scoped to a non-existent rating line. */
export function buildEligibilityOnlyNoticeMissingScopeDefinition(): ProgramDefinition {
	return buildProgramDefinition(
		'eligibility-only-notice-missing',
		'Eligibility-only notice missing scope program',
		standardQualification,
		undefined,
		{ notices: [buildNotice('scoped', 'Scoped notice', { scope: 'base' })] },
	)
}

export const eligibilityOnlyBatchSubjects: Subject[] = [eligibleSubject, ineligibleSubject]

/** A program failing qualification (referral) with a clean authority attached. */
export const failedQualificationWithAuthorityProgramDefinition = buildProgramDefinition(
	failedQualificationProgramDefinition.id,
	failedQualificationProgramDefinition.name,
	failedQualificationProgramDefinition.qualification,
	failedQualificationProgramDefinition.rating,
	{ authority: cleanAuthority },
)

const allScopedGates = createLogicalDefinition('all-scoped-gates', 'All scoped gates', [
	createRule(
		'frame',
		[createAtom('construction', 'equals', 'Frame')],
		createAtom('frame', 'equals', true),
	),
])

export const allLinesScopedOutProgramDefinition = buildProgramDefinition(
	'all-scoped',
	'All lines scoped out program',
	qualificationDefinition(
		'all-scoped-qualification',
		'All scoped qualification',
		[allScopedGates],
		{
			rulings: [
				rulingDefinition('frame-wind', 'all-scoped-gates', 'frame', 'restriction', {
					scope: 'wind',
					message: 'Wind is unavailable for Frame construction',
				}),
				rulingDefinition('frame-exwind', 'all-scoped-gates', 'frame', 'restriction', {
					scope: 'exWind',
					message: 'Ex-wind is unavailable for Frame construction',
				}),
			],
		},
	),
	ratingDefinition('all-scoped-rating', 'All scoped rating', [
		lineDefinition('wind', 'Wind', windRate),
		lineDefinition('exWind', 'Ex-Wind', exWindRate),
	]),
)

/** Build `count` distinct eligible/ineligible-alternating batch subjects. */
export function buildLargeBatch(count: number): Subject[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `bulk-${index}`,
		licensed: index % 2 === 0,
		amount: index,
		location: index % 3 === 0 ? 'east' : 'west',
	}))
}

/** Batch subjects sharing the same `id`, distinguished by `licensed`. */
export const sharedIdBatchSubjects: Subject[] = [
	{ id: 'shared', licensed: true, amount: 5, location: 'east' },
	{ id: 'shared', licensed: false, amount: 7, location: 'west' },
]

/** Build a subject carrying its own `__proto__` / `constructor` OWN keys via JSON parsing. */
export function buildHostileSubject(): Subject {
	return JSON.parse(
		'{"id":"hostile","licensed":true,"__proto__":{"polluted":true},"constructor":{"polluted":true}}',
	)
}

/** Whether a repository-relative Vue SFC path belongs to the private browser application. */
export function isBrowserVuePath(path: string): boolean {
	const normalized = path.replaceAll('\\', '/')
	return normalized.startsWith('app/browser/')
}
