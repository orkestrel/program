import type { LineDefinition, RaterInterface, RaterOptions } from '@orkestrel/rater'
import type {
	Definition,
	LogicalDefinition,
	ReasonInterface,
	ReasonOptions,
	ReasonResult,
	Subject,
} from '@orkestrel/reason'
import type { ProgramDefinition, ProgramEventMap, ProgramInterface } from '@src/core'
import { createRater, isRatingDefinition } from '@orkestrel/rater'
import { qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'
import { lineDefinition, ratingDefinition } from '@orkestrel/rater'
import {
	atom,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	factorGroup,
	fieldFactor,
	logicalDefinition,
	quantitativeDefinition,
	rule,
	staticFactor,
} from '@orkestrel/reason'
import { aggregateDefinition, noticeDefinition, programDefinition } from '@src/core'

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

const licensedGates = logicalDefinition('gates', 'Eligibility gates', [
	rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
])

export const baseRate = quantitativeDefinition('base-rate', 'Base rate', [
	factorGroup('amount', 'sum', [staticFactor('minimum', 100)]),
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

export const standardProgramDefinition = programDefinition(
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

export const referralProgramDefinition = programDefinition(
	'referral',
	'Referral program',
	referralQualification,
	standardRating,
)

export const referralSubject: Subject = { id: 'risk-referral', licensed: false }

const windGates = logicalDefinition('wind-gates', 'Wind gates', [
	rule('frame', [atom('construction', 'equals', 'Frame')], atom('frame', 'equals', true)),
])

const windRate = quantitativeDefinition('wind-rate', 'Wind rate', [
	factorGroup('wind', 'sum', [staticFactor('flat', 50)]),
])

const exWindRate = quantitativeDefinition('ex-wind-rate', 'Ex-wind rate', [
	factorGroup('ex-wind', 'sum', [staticFactor('flat', 75)]),
])

export const scopedProgramDefinition = programDefinition(
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

const coastalGates = logicalDefinition('coastal-gates', 'Coastal gates', [
	rule('coastal', [atom('location', 'equals', 'coastal')], atom('coastal', 'equals', true)),
])

export const coastalReferralSubject: Subject = { id: 'risk-coastal', location: 'coastal' }

const failingPass = quantitativeDefinition('failing-pass', 'Failing pass', [
	factorGroup('g', 'sum', [fieldFactor('req', ['missing'], { required: true })], { strict: true }),
])

export const failedQualificationProgramDefinition = programDefinition(
	'failed-qualification',
	'Failed qualification program',
	qualificationDefinition('failed-qualification', 'Failed qualification', [failingPass]),
	standardRating,
)

const conditionalGates = logicalDefinition('conditional-gates', 'Conditional gates', [
	rule('present', [atom('id', 'equals', 'risk-conditional')], atom('flag', 'equals', true)),
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

export const conditionalProgramDefinition = programDefinition(
	'conditional',
	'Conditional program',
	conditionalQualification,
	standardRating,
)

export const conditionalSubject: Subject = { id: 'risk-conditional' }

export const emptyLinesProgramDefinition = programDefinition(
	'empty-lines',
	'Empty lines program',
	qualificationDefinition('empty-qualification', 'Empty qualification', []),
	ratingDefinition('empty-rating', 'Empty rating', []),
)

export const emptyCollectionsProgramDefinition = programDefinition(
	'empty-collections',
	'Empty collections program',
	qualificationDefinition('bare-qualification', 'Bare qualification', []),
	standardRating,
)

export const noticeProgramDefinition = programDefinition(
	'noticed',
	'Noticed program',
	standardQualification,
	standardRating,
	{
		notices: [noticeDefinition('rated', 'Program {{id}} executed for {{licensed}}')],
	},
)

export function buildAuthorityProgram(authority: LogicalDefinition): ProgramDefinition {
	return programDefinition(
		'authority',
		'Authority program',
		standardQualification,
		standardRating,
		{
			authority,
		},
	)
}

export const conditionalAuthority = logicalDefinition('authority', 'Final authority', [
	rule(
		'manual',
		[atom(['outcome', 'status'], 'equals', 'conditional')],
		atom('limited', 'equals', true),
		{
			name: 'Manual authority required',
			description: 'Conditional outcomes require manual authority',
		},
	),
])

export const cleanAuthority = logicalDefinition('authority', 'Clean authority', [
	rule('never', [atom('blocked', 'equals', true)], atom('limited', 'equals', true)),
])

export const scopedReferralProgramDefinition = programDefinition(
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

export const unratedAuthority = logicalDefinition('authority', 'Unrated authority', [
	rule(
		'unrated-cap',
		[atom(['outcome', 'status'], 'equals', 'unrated')],
		atom('limited', 'equals', true),
		{ description: 'Unrated outcomes require manual review' },
	),
])

export const batchAggregateProgramDefinition = programDefinition(
	'batch',
	'Batch program',
	standardQualification,
	standardRating,
	{
		aggregate: aggregateDefinition(['amount'], { by: 'location' }),
	},
)

export const batchSubjects: Subject[] = [
	{ id: 'a', licensed: true, amount: 10, location: 'east' },
	{ id: 'b', licensed: false, amount: 20, location: 'west' },
	{ id: 'c', licensed: true, amount: 30, location: 'east' },
]

export function buildAggregateGateProgram(threshold: number): ProgramDefinition {
	const gates = logicalDefinition('batch-gates', 'Batch gates', [
		rule(
			'portfolio-cap',
			[atom(['aggregate', 'sums', 'amount'], 'above', threshold)],
			atom('limited', 'equals', true),
			{ description: 'Portfolio cap exceeded' },
		),
	])
	return programDefinition(
		'aggregate-gate',
		'Aggregate gate program',
		standardQualification,
		standardRating,
		{
			aggregate: aggregateDefinition(['amount'], { gates }),
		},
	)
}

export function buildCarrierProgram(): ProgramDefinition {
	const gates = logicalDefinition('carrier-gates', 'Carrier gates', [
		rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
	])

	const amountRate = quantitativeDefinition('amount-rate', 'Amount rate', [
		factorGroup('amount', 'sum', [staticFactor('flat', 10)]),
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

	return programDefinition('carrier', 'Carrier program', qualification, rating, {
		notices: [noticeDefinition('audit', 'Carrier audit for {{id}}')],
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
	return logicalDefinition(id, 'Broken definition', [
		rule(`${id}-rule`, [], atom('limited', 'equals', true)),
	])
}

export const zeroPassQualification = qualificationDefinition(
	'zero-pass-qualification',
	'Zero pass qualification',
	[],
)

export const brokenAggregateGateProgramDefinition = programDefinition(
	'broken-aggregate-gate',
	'Broken aggregate gate program',
	zeroPassQualification,
	undefined,
	{
		aggregate: aggregateDefinition(['amount'], {
			gates: buildBrokenLogicalDefinition('broken-aggregate-gates'),
		}),
	},
)

export const brokenAuthorityProgramDefinition = programDefinition(
	'broken-authority',
	'Broken authority program',
	zeroPassQualification,
	undefined,
	{ authority: buildBrokenLogicalDefinition('broken-authority-gates') },
)

/** An eligibility-only definition (no `rating`) reusing the standard qualification. */
export const eligibilityOnlyProgramDefinition = programDefinition(
	'eligibility-only',
	'Eligibility-only program',
	standardQualification,
)

/** An eligibility-only definition reusing the conditional qualification. */
export const eligibilityOnlyConditionalProgramDefinition = programDefinition(
	'eligibility-only-conditional',
	'Eligibility-only conditional program',
	conditionalProgramDefinition.qualification,
)

/** An eligibility-only definition reusing the referral qualification. */
export const eligibilityOnlyReferralProgramDefinition = programDefinition(
	'eligibility-only-referral',
	'Eligibility-only referral program',
	referralProgramDefinition.qualification,
)

/** An eligibility-only definition with a clean authority. */
export const eligibilityOnlyWithAuthorityProgramDefinition = programDefinition(
	'eligibility-only-authority',
	'Eligibility-only authority program',
	standardQualification,
	undefined,
	{ authority: cleanAuthority },
)

/** An eligibility-only definition with a notice scoped to a non-existent rating line. */
export function buildEligibilityOnlyNoticeMissingScopeDefinition(): ProgramDefinition {
	return programDefinition(
		'eligibility-only-notice-missing',
		'Eligibility-only notice missing scope program',
		standardQualification,
		undefined,
		{ notices: [noticeDefinition('scoped', 'Scoped notice', { scope: 'base' })] },
	)
}

export const eligibilityOnlyBatchSubjects: Subject[] = [eligibleSubject, ineligibleSubject]

/** A program failing qualification (referral) with a clean authority attached. */
export const failedQualificationWithAuthorityProgramDefinition = programDefinition(
	failedQualificationProgramDefinition.id,
	failedQualificationProgramDefinition.name,
	failedQualificationProgramDefinition.qualification,
	failedQualificationProgramDefinition.rating,
	{ authority: cleanAuthority },
)

const allScopedGates = logicalDefinition('all-scoped-gates', 'All scoped gates', [
	rule('frame', [atom('construction', 'equals', 'Frame')], atom('frame', 'equals', true)),
])

export const allLinesScopedOutProgramDefinition = programDefinition(
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
