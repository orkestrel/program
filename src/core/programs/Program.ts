import type { EmitterInterface } from '@orkestrel/emitter'
import type { QualificationResult, QualifierInterface } from '@orkestrel/qualifier'
import type { RaterInterface, RatingResult } from '@orkestrel/rater'
import type { EvaluatorInterface, LogicalResult, ReasonInterface, Subject } from '@orkestrel/reason'
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
import { isArray } from '@orkestrel/contract'
import { createQualifier, isQualificationResult } from '@orkestrel/qualifier'
import { createRater, isRatingResult } from '@orkestrel/rater'
import {
	createEvaluator,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	isLogicalResult,
} from '@orkestrel/reason'
import { DEFAULT_PROGRAM_VALIDATE, OUTCOME_KEY } from '../constants.js'
import { ProgramError } from '../errors.js'
import {
	aggregateGroups,
	aggregateSums,
	assertProgramDefinition,
	assertProgramSubject,
	buildAggregateProjection,
	buildAggregateRecord,
	buildAggregateResult,
	buildEmptyTallies,
	buildLimitDeterminations,
	buildNoticeDeterminations,
	buildOutcomeProjection,
	buildProgramResult,
	buildQualificationSubject,
	deriveStatus,
	selectProgramLines,
	tallySubject,
	validateProgramDefinition,
} from '../helpers.js'

/**
 * Composes one qualifier and one rater over a shared reason engine and executes
 * single subjects or aggregate-aware batches.
 *
 * @remarks
 * Qualification decides whether rating happens: a globally ineligible, referred,
 * or failed subject never reaches the rater, and a scoped ineligibility removes
 * only its line before the first rating call. The rater always receives the
 * ORIGINAL subject; the qualifier's aggregate projection stays private. When no
 * qualifier, rater, or engine is injected the program creates ONE shared
 * quantitative-plus-logical engine, injects it into the qualifier and rater it
 * creates, and destroys only what it owns. A definition failure during
 * construction (an invalid definition under `options.validate`) tears down
 * whatever the constructor had already allocated before throwing. Construction
 * snapshots the caller's definition once, runs the always-on assertions against
 * that snapshot, and seals its plain-object graph before exposure. A `Map`, `Set`,
 * or `Date` reached through a reason `Check.value` is cloned but remains mutable
 * because its contents live in internal slots. Uncloneable values and non-empty
 * typed arrays are refused with `ProgramError('DEFINITION')` and the host error
 * as its cause. `destroy()` is idempotent and REENTRANCY-SAFE — the destroyed
 * flag is set BEFORE any teardown or the `destroy` event fires, so a listener
 * that re-enters `destroy()` is a no-op — and tears the emitter down last.
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

	/** Holds the authored id of the definition this program compiled. */
	readonly id: string
	/** Holds the authored display name of the definition this program compiled. */
	readonly name: string
	/** Holds the sealed snapshot of the authored definition this program compiled. */
	readonly definition: ProgramDefinition

	/**
	 * Compiles one program from an authored definition.
	 *
	 * @param definition - The authored program definition
	 * @param options - Optional injected qualifier, rater, engine, validation, labels, and emitter hooks
	 * @throws {@link ProgramError} Thrown when the definition cannot be cloned or
	 * sealed, or when validation is enabled and the definition fails
	 * (`'DEFINITION'`).
	 * @throws {@link ProgramError} Thrown when a ruling or notice scope names no
	 * rating line (`'MISSING'`).
	 * @throws {@link ProgramError} Thrown when the definition repeats a rating-line
	 * or notice id (`'DUPLICATE'`).
	 */
	constructor(definition: ProgramDefinition, options?: ProgramOptions) {
		let snapshot: ProgramDefinition
		try {
			snapshot = structuredClone(definition)
		} catch (cause) {
			throw new ProgramError(
				'DEFINITION',
				'Program definition could not be cloned',
				undefined,
				cause,
			)
		}
		assertProgramDefinition(snapshot)
		this.id = snapshot.id
		this.name = snapshot.name
		this.definition = snapshot
		try {
			this.#seal()
		} catch (cause) {
			throw new ProgramError(
				'DEFINITION',
				'Program definition could not be sealed',
				snapshot.id,
				cause,
			)
		}
		this.#emitter = new Emitter({
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
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
				this.destroy()
				throw new ProgramError('DEFINITION', validation.errors.join('; '), snapshot.id)
			}
		}
	}

	/**
	 * Holds the typed observation surface carrying `qualify`, `rate`, `determine`,
	 * `decide`, `execute`, `aggregate`, and `destroy`.
	 *
	 * @returns The emitter this program owns
	 *
	 * @example
	 * ```ts
	 * import { createProgram } from '@orkestrel/program'
	 *
	 * const program = createProgram(definition)
	 * program.emitter.on('execute', (result) => result.status)
	 * program.destroy()
	 * ```
	 */
	get emitter(): EmitterInterface<ProgramEventMap> {
		return this.#emitter
	}

	// Array overload first so a subject list resolves to the batch form.
	/**
	 * Executes a subject list as one aggregate-aware batch.
	 *
	 * @remarks
	 * Every subject is asserted before any work runs, so a reserved key in the last
	 * subject rejects the batch before the first one qualifies. The batch sums,
	 * partitions, and per-subject aggregate projections are computed next, each
	 * subject executes in input order, every result tallies by status, and optional
	 * aggregate gates run last against the batch aggregate record.
	 *
	 * @param subjects - The subjects to execute, in input order
	 * @returns A fresh aggregate result carrying every subject result, the batch
	 * determinations, partitions, tallies, and sums
	 * @throws {@link ProgramError} Thrown when the program has been destroyed
	 * (`'DESTROYED'`).
	 * @throws {@link ProgramError} Thrown when a subject is not a record, or when a
	 * borrowed qualifier, rater, or reason engine returns an off-contract result
	 * (`'MISMATCH'`).
	 * @throws {@link ProgramError} Thrown when a subject already carries the
	 * `aggregate` or `outcome` key (`'RESERVED'`).
	 *
	 * @example
	 * ```ts
	 * import { createProgram } from '@orkestrel/program'
	 *
	 * const program = createProgram(definition)
	 * program.execute([{ id: 'risk-1', licensed: true }]).count // 1
	 * program.destroy()
	 * ```
	 */
	execute(subjects: readonly Subject[]): AggregateResult
	/**
	 * Executes one subject through the composed qualify-rate-determine workflow.
	 *
	 * @remarks
	 * Qualification decides whether rating happens: a globally ineligible, referred,
	 * or failed subject never reaches the rater, and a scoped ineligibility removes
	 * only its line before the first rating call. The rater always receives the
	 * ORIGINAL subject. Notices, status, optional authority, and the optional
	 * decision follow, in that order.
	 *
	 * @param subject - The subject to execute
	 * @returns A fresh program result carrying the nested qualification and rating
	 * evidence, determinations, status, and optional decision
	 * @throws {@link ProgramError} Thrown when the program has been destroyed
	 * (`'DESTROYED'`).
	 * @throws {@link ProgramError} Thrown when the subject is not a record, or when a
	 * borrowed qualifier, rater, or reason engine returns an off-contract result
	 * (`'MISMATCH'`).
	 * @throws {@link ProgramError} Thrown when the subject already carries the
	 * `aggregate` or `outcome` key (`'RESERVED'`).
	 *
	 * @example
	 * ```ts
	 * import { createProgram } from '@orkestrel/program'
	 *
	 * const program = createProgram(definition)
	 * program.execute({ id: 'risk-1', licensed: true }).status // 'eligible'
	 * program.destroy()
	 * ```
	 */
	execute(subject: Subject): ProgramResult
	execute(input: Subject | readonly Subject[]): ProgramResult | AggregateResult {
		this.#alive()
		if (isArray<Subject>(input)) return this.#aggregate(input)
		return this.#subject(input)
	}

	/**
	 * Validates this program's definition and every nested definition.
	 *
	 * @remarks
	 * Exact shape is `isProgramDefinition`'s job. This checks the meaning: non-empty id
	 * and name, every ruling and notice scope naming a rating line, unique non-empty
	 * aggregate fields, and a non-empty partition field when present. Nested
	 * qualification validation is delegated to the injected qualifier, and authority
	 * and aggregate-gate validation to the shared reason engine.
	 *
	 * @returns A fresh validation result carrying `valid`, `errors`, and `warnings`
	 * @throws {@link ProgramError} Thrown when the program has been destroyed
	 * (`'DESTROYED'`).
	 *
	 * @example
	 * ```ts
	 * import { createProgram } from '@orkestrel/program'
	 *
	 * const program = createProgram(definition, { validate: false })
	 * program.validate().valid // true
	 * program.destroy()
	 * ```
	 */
	validate(): ProgramValidationResult {
		this.#alive()
		return validateProgramDefinition(this.definition, this.#qualifier, this.#engine)
	}

	/**
	 * Destroys this program, idempotently.
	 *
	 * @remarks
	 * The destroyed flag is set BEFORE any teardown or the `destroy` event, so a
	 * listener re-entering `destroy` is a no-op. An owned qualifier, rater, and reason
	 * engine are destroyed; an injected one stays caller-owned. The emitter is torn
	 * down last, and stays reachable afterwards.
	 *
	 * @example
	 * ```ts
	 * import { createProgram } from '@orkestrel/program'
	 *
	 * const program = createProgram(definition)
	 * program.destroy()
	 * program.destroy() // a second call is a no-op
	 * ```
	 */
	destroy(): void {
		if (this.#destroyed) return
		this.#destroyed = true
		if (this.#qualifierOwned) this.#qualifier.destroy()
		if (this.#raterOwned) this.#rater.destroy()
		if (this.#engineOwned) this.#engine.destroy()
		this.#emitter.emit('destroy')
		this.#emitter.destroy()
	}

	#subject(subject: Subject, aggregate?: AggregateProjection): ProgramResult {
		assertProgramSubject(subject)
		const qualified = buildQualificationSubject(subject, aggregate)
		const qualification = this.#qualifier.qualify(qualified, this.definition.qualification)
		if (!isQualificationResult(qualification)) {
			throw new ProgramError(
				'MISMATCH',
				'Qualifier returned invalid qualification result',
				this.definition.qualification.id,
			)
		}
		this.#emitter.emit('qualify', qualification)

		if (!qualification.success || qualification.eligibility !== 'eligible') {
			return this.#finish(subject, qualification, undefined)
		}

		const lines = selectProgramLines(this.definition.rating?.lines ?? [], qualification.scopes)
		const rating = lines.length === 0 ? undefined : this.#rater.rate(lines, subject)
		if (rating !== undefined) {
			if (!isRatingResult(rating)) {
				throw new ProgramError(
					'MISMATCH',
					'Rater returned invalid rating result',
					this.definition.rating?.id,
				)
			}
			this.#emitter.emit('rate', rating)
		}

		return this.#finish(subject, qualification, rating)
	}

	#finish(
		subject: Subject,
		qualification: QualificationResult,
		rating?: RatingResult,
	): ProgramResult {
		const notices = buildNoticeDeterminations(this.definition.notices ?? [], subject)
		for (const notice of notices) this.#emitter.emit('determine', notice)

		const status = deriveStatus(this.definition, qualification, rating)
		let result = buildProgramResult(this.definition, qualification, rating, notices, status)

		const authority = this.definition.authority
		if (authority === undefined) {
			this.#emitter.emit('execute', result)
			return result
		}

		const outcome = { [OUTCOME_KEY]: buildOutcomeProjection(result) }
		const resolved = this.#engine.reason(outcome, authority)
		if (!isLogicalResult(resolved)) {
			throw new ProgramError('MISMATCH', 'Authority returned invalid logical result', authority.id)
		}

		const limits = buildLimitDeterminations(
			authority,
			resolved,
			outcome,
			this.#evaluator,
			this.#labels,
		)
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

	#aggregate(subjects: readonly Subject[]): AggregateResult {
		for (const subject of subjects) assertProgramSubject(subject)

		const definition = this.definition.aggregate
		const fields = [...(definition?.fields ?? [])]
		const sums = aggregateSums(subjects, fields)
		const groups = aggregateGroups(subjects, fields, definition?.partition)
		let tallies = buildEmptyTallies(fields)
		const results = subjects.map((subject) => {
			const projection =
				definition === undefined
					? undefined
					: buildAggregateProjection(subject, subjects.length, sums, groups, definition.partition)
			const result = this.#subject(subject, projection)
			tallies = tallySubject(tallies, result, subject, fields)
			return result
		})

		const gates = this.#aggregateLimits(subjects.length, sums, groups)
		const result = buildAggregateResult(
			this.definition,
			results,
			gates.determinations,
			groups,
			tallies,
			sums,
			gates.resolved === undefined ? undefined : { gates: gates.resolved },
		)
		this.#emitter.emit('aggregate', result)
		return result
	}

	#aggregateLimits(
		count: number,
		sums: Readonly<Record<string, number>>,
		groups: readonly AggregateGroup[],
	): { readonly determinations: readonly Determination[]; readonly resolved?: LogicalResult } {
		const gates = this.definition.aggregate?.gates
		if (gates === undefined) return { determinations: [] }

		const record = buildAggregateRecord(count, sums, groups)
		const resolved = this.#engine.reason(record, gates)
		if (!isLogicalResult(resolved)) {
			throw new ProgramError(
				'MISMATCH',
				'Aggregate gates returned invalid logical result',
				gates.id,
			)
		}

		const determinations = buildLimitDeterminations(
			gates,
			resolved,
			record,
			this.#evaluator,
			this.#labels,
		)
		for (const determination of determinations) this.#emitter.emit('determine', determination)
		return { determinations, resolved }
	}

	#alive(): void {
		if (this.#destroyed) {
			throw new ProgramError('DESTROYED', 'Program has been destroyed', this.id)
		}
	}

	#seal(): void {
		const pending: object[] = [this.definition]
		while (pending.length > 0) {
			const value = pending.pop()
			if (value === undefined || Object.isFrozen(value)) continue
			Object.freeze(value)
			for (const child of Object.values(value)) {
				if (child !== null && typeof child === 'object') pending.push(child)
			}
		}
	}
}
