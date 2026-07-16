import type { EmitterInterface } from '@orkestrel/emitter'
import type { QualificationResult, QualifierInterface } from '@orkestrel/qualifier'
import type { RaterInterface, RatingResult } from '@orkestrel/rater'
import type { EvaluatorInterface, ReasonInterface, Subject } from '@orkestrel/reason'
import type {
	AggregateGroup,
	AggregateProjection,
	AggregateResult,
	Determination,
	ProgramDefinition,
	ProgramEventMap,
	ProgramInterface,
	ProgramOptions,
	ProgramResult,
	ProgramValidationResult,
} from '../types.js'
import { Emitter } from '@orkestrel/emitter'
import { createQualifier } from '@orkestrel/qualifier'
import { createRater } from '@orkestrel/rater'
import {
	createEvaluator,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
} from '@orkestrel/reason'
import { DEFAULT_PROGRAM_VALIDATE, OUTCOME_KEY } from '../constants.js'
import { ProgramError } from '../errors.js'
import {
	aggregateGroups,
	aggregateSums,
	assertProgramSubject,
	buildAggregateProjection,
	buildAggregateRecord,
	buildAggregateResult,
	buildLimits,
	buildNotices,
	buildOutcomeProjection,
	buildProgramResult,
	buildQualificationSubject,
	deriveStatus,
	emptyTallies,
	findMissingScopes,
	selectProgramLines,
	tallyProgram,
	validateProgramDefinition,
} from '../helpers.js'

/**
 * One compiled program — composes one qualifier and one rater over a shared
 * reason engine and executes single subjects or aggregate-aware batches.
 *
 * @remarks
 * Qualification decides whether rating happens: a globally ineligible, referred,
 * or failed subject never reaches the rater, and a scoped ineligibility removes
 * only its line before the first rating call. The rater always receives the
 * ORIGINAL subject; the qualifier's aggregate projection stays private. When no
 * qualifier, rater, or engine is injected the program creates ONE shared
 * quantitative-plus-logical engine, injects it into the qualifier and rater it
 * creates, and destroys only what it owns. `destroy()` is idempotent and tears
 * the emitter down last.
 */
export class Program implements ProgramInterface {
	readonly #emitter: Emitter<ProgramEventMap>
	readonly #qualifier: QualifierInterface
	readonly #rater: RaterInterface
	readonly #engine: ReasonInterface
	readonly #evaluator: EvaluatorInterface
	readonly #qualifierOwned: boolean
	readonly #raterOwned: boolean
	readonly #engineOwned: boolean
	readonly #validate: boolean
	readonly #labels: Readonly<Record<string, string>> | undefined
	#destroyed = false

	readonly id: string
	readonly name: string
	readonly definition: ProgramDefinition

	constructor(definition: ProgramDefinition, options?: ProgramOptions) {
		const missing = findMissingScopes(definition)
		if (missing.length > 0) {
			throw new ProgramError(
				'MISSING',
				`Unknown rating line reference: ${missing.join(', ')}`,
				definition.id,
			)
		}
		this.id = definition.id
		this.name = definition.name
		this.definition = definition
		this.#emitter = new Emitter({ on: options?.on, error: options?.error })
		this.#evaluator = createEvaluator()
		this.#engineOwned = options?.engine === undefined
		this.#qualifierOwned = options?.qualifier === undefined
		this.#raterOwned = options?.rater === undefined
		this.#engine =
			options?.engine ??
			createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
		this.#qualifier = options?.qualifier ?? createQualifier({ engine: this.#engine })
		this.#rater = options?.rater ?? createRater({ engine: this.#engine })
		this.#validate = options?.validate ?? DEFAULT_PROGRAM_VALIDATE
		this.#labels = options?.labels

		if (this.#validate) {
			const validation = this.validate()
			if (!validation.valid) {
				throw new ProgramError('DEFINITION', validation.errors.join('; '), definition.id)
			}
		}
	}

	get emitter(): EmitterInterface<ProgramEventMap> {
		return this.#emitter
	}

	execute(subjects: Subject[]): AggregateResult
	execute(subject: Subject): ProgramResult
	execute(input: Subject | Subject[]): ProgramResult | AggregateResult {
		this.#alive()
		if (Array.isArray(input)) return this.#aggregate(input)
		return this.#subject(input)
	}

	validate(): ProgramValidationResult {
		this.#alive()
		return validateProgramDefinition(this.definition, this.#qualifier, this.#engine)
	}

	destroy(): void {
		if (this.#destroyed) return
		if (this.#qualifierOwned) this.#qualifier.destroy()
		if (this.#raterOwned) this.#rater.destroy()
		if (this.#engineOwned) this.#engine.destroy()
		this.#destroyed = true
		this.#emitter.emit('destroy')
		this.#emitter.destroy()
	}

	#subject(subject: Subject, aggregate?: AggregateProjection): ProgramResult {
		assertProgramSubject(subject)
		const qualified = buildQualificationSubject(subject, aggregate)
		const qualification = this.#qualifier.qualify(qualified, this.definition.qualification)
		this.#emitter.emit('qualify', qualification)

		if (!qualification.success || qualification.eligibility !== 'eligible') {
			return this.#finish(subject, qualification, undefined)
		}

		const lines = selectProgramLines(this.definition.rating.lines, qualification.scopes)
		const rating = lines.length === 0 ? undefined : this.#rater.rate(lines, subject)
		if (rating !== undefined) this.#emitter.emit('rate', rating)

		return this.#finish(subject, qualification, rating)
	}

	#finish(
		subject: Subject,
		qualification: QualificationResult,
		rating?: RatingResult,
	): ProgramResult {
		const notices = buildNotices(this.definition.notices ?? [], subject)
		for (const notice of notices) this.#emitter.emit('determine', notice)

		const status = deriveStatus(qualification, rating)
		let result = buildProgramResult(this.definition, qualification, rating, notices, status)

		const authority = this.definition.authority
		if (authority === undefined) {
			this.#emitter.emit('execute', result)
			return result
		}

		const outcome = { [OUTCOME_KEY]: buildOutcomeProjection(result) }
		const resolved = this.#engine.reason(outcome, authority)
		if (resolved.reasoning !== 'logical') {
			throw new ProgramError('MISMATCH', 'Authority returned non-logical reasoning', authority.id)
		}

		const limits = buildLimits(authority, resolved, outcome, this.#evaluator, this.#labels)
		for (const limit of limits) this.#emitter.emit('determine', limit)

		result = buildProgramResult(
			this.definition,
			qualification,
			rating,
			[...notices, ...limits],
			status,
			{ authority: resolved },
		)

		if (result.decision !== undefined) this.#emitter.emit('decide', result.decision, result)
		this.#emitter.emit('execute', result)
		return result
	}

	#aggregate(subjects: Subject[]): AggregateResult {
		for (const subject of subjects) assertProgramSubject(subject)

		const definition = this.definition.aggregate
		const fields = [...(definition?.fields ?? [])]
		const sums = aggregateSums(subjects, fields)
		const groups = aggregateGroups(subjects, fields, definition?.by)
		let tallies = emptyTallies(fields)
		const results = subjects.map((subject) => {
			const projection =
				definition === undefined
					? undefined
					: buildAggregateProjection(subject, subjects.length, sums, groups, definition.by)
			const result = this.#subject(subject, projection)
			tallies = tallyProgram(tallies, result, subject, fields)
			return result
		})

		const determinations = this.#aggregateLimits(subjects.length, sums, groups)
		const result = buildAggregateResult(
			this.definition,
			results,
			determinations,
			groups,
			tallies,
			sums,
		)
		this.#emitter.emit('aggregate', result)
		return result
	}

	#aggregateLimits(
		count: number,
		sums: Readonly<Record<string, number>>,
		groups: readonly AggregateGroup[],
	): readonly Determination[] {
		const gates = this.definition.aggregate?.gates
		if (gates === undefined) return []

		const record = buildAggregateRecord(count, sums, groups)
		const resolved = this.#engine.reason(record, gates)
		if (resolved.reasoning !== 'logical') {
			throw new ProgramError('MISMATCH', 'Aggregate gates returned non-logical reasoning', gates.id)
		}

		const determinations = buildLimits(gates, resolved, record, this.#evaluator, this.#labels)
		for (const determination of determinations) this.#emitter.emit('determine', determination)
		return determinations
	}

	#alive(): void {
		if (this.#destroyed) {
			throw new ProgramError('DESTROYED', 'Program has been destroyed', this.id)
		}
	}
}
