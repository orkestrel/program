import type { FieldPath, JSONValue } from '@orkestrel/contract'
import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'
import type {
	Eligibility,
	Premise,
	QualificationDefinition,
	QualificationResult,
	QualifierInterface,
} from '@orkestrel/qualifier'
import type { RatingDefinition, RatingResult, RaterInterface } from '@orkestrel/rater'
import type { LogicalDefinition, ReasonInterface, Subject } from '@orkestrel/reason'
import type { STATUSES } from './constants.js'

/** Identifies a final authority outcome, derived from global eligibility. */
export type Decision = 'approved' | 'denied' | 'submitted'

/** Identifies the presentation and tally status derived from eligibility, conditions, and rating success. */
export type Status = (typeof STATUSES)[number]

/** Identifies a post-qualification program determination effect. */
export type ProgramEffect = 'notice' | 'limit'

/** Identifies a coded {@link ProgramError} programmer-error code. */
export type ProgramErrorCode =
	| 'DUPLICATE'
	| 'MISSING'
	| 'DEFINITION'
	| 'MISMATCH'
	| 'RESERVED'
	| 'DESTROYED'

/**
 * Describes the optional fields accepted by `buildNotice`.
 *
 * @remarks
 * `scope` — the rating-line id the notice presents against; omitted for an
 * unscoped, program-wide notice.
 */
export interface NoticeInput {
	readonly scope?: string
}

/**
 * Describes the optional fields accepted by `buildAggregateDefinition`.
 *
 * @remarks
 * `partition` — the field a batch partitions on; omitted skips partitioning.
 * `gates` — a logical definition evaluated once over the whole batch to derive
 * `limit` determinations.
 */
export interface AggregateInput {
	readonly partition?: FieldPath
	readonly gates?: LogicalDefinition
}

/**
 * Describes the optional fields accepted by `buildProgramDefinition`.
 *
 * @remarks
 * `description` — a free-text summary. `notices` — authored unconditional
 * notices. `authority` — a logical definition evaluated per subject to derive
 * limit determinations and the decision. `aggregate` — batch aggregate fields,
 * partition field, and gates. `metadata` — opaque caller data, copied fresh.
 */
export interface ProgramInput {
	readonly description?: string
	readonly notices?: readonly Notice[]
	readonly authority?: LogicalDefinition
	readonly aggregate?: AggregateDefinition
	readonly metadata?: JSONValue
}

/** Describes an authored, unconditional program notice. */
export interface Notice {
	readonly id: string
	readonly message: string
	readonly scope?: string
}

/** Describes one resolved notice or authority-limit outcome. */
export interface Determination {
	readonly id: string
	readonly effect: ProgramEffect
	readonly applied: boolean
	readonly scope?: string
	readonly message?: string
	readonly premises: readonly Premise[]
}

/** Describes batch aggregate fields, an optional partition field, and optional gates. */
export interface AggregateDefinition {
	readonly fields: readonly FieldPath[]
	readonly partition?: FieldPath
	readonly gates?: LogicalDefinition
}

/** Describes one subject's private aggregate working projection. */
export interface AggregateProjection {
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
	readonly group?: AggregateGroup
}

/** Describes one batch aggregate partition. */
export interface AggregateGroup {
	readonly key: string
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
}

/** Describes a status tally — a count plus summed aggregate fields. */
export interface Tally {
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
}

/**
 * Describes a pure authored program definition.
 *
 * @remarks
 * `qualification` runs first through `@orkestrel/qualifier`; `rating` runs only
 * over the lines scoped eligibility left standing, through `@orkestrel/rater`.
 * `authority` (a logical definition) runs last, over the assembled result
 * extended with an outcome projection, to derive limit determinations and the
 * final decision. An omitted `rating` authors an ELIGIBILITY-ONLY program — the
 * rater is never invoked, an eligible subject resolves to `'eligible'` (or
 * `'conditional'` under an applied condition or scoped restriction), status is
 * never `'unrated'`, and decisions remain reachable through `authority`. Program
 * construction clones the definition and seals its plain-object graph. A `Map`,
 * `Set`, or `Date` reached through a reason `Check.value` is cloned, but its
 * contents remain mutable because the seal cannot reach its internal slots. A
 * value that structured cloning cannot copy, or a non-empty typed array that
 * cannot be frozen, is refused with `ProgramError('DEFINITION')` and the host
 * error attached as its cause.
 */
export interface ProgramDefinition {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly qualification: QualificationDefinition
	readonly rating?: RatingDefinition
	readonly notices?: readonly Notice[]
	readonly authority?: LogicalDefinition
	readonly aggregate?: AggregateDefinition
	readonly metadata?: JSONValue
}

/** Describes one subject's complete program outcome. */
export interface ProgramResult {
	readonly id: string
	readonly name: string
	readonly eligibility: Eligibility
	readonly status: Status
	/**
	 * Holds the final authority outcome.
	 *
	 * @remarks
	 * Present ONLY when the program HAS an `authority`, the execution SUCCEEDED
	 * (qualification, rating when it ran, and authority all produced no errors),
	 * no `limit` determination applied, and status is not `unrated`.
	 */
	readonly decision?: Decision
	readonly qualification: QualificationResult
	readonly rating?: RatingResult
	readonly determinations: readonly Determination[]
	readonly success: boolean
	readonly trace: readonly string[]
	readonly errors: readonly string[]
}

/** Describes a batch program outcome across every subject. */
export interface AggregateResult {
	readonly id: string
	readonly name: string
	readonly subjects: readonly ProgramResult[]
	readonly determinations: readonly Determination[]
	readonly groups: readonly AggregateGroup[]
	readonly tallies: Readonly<Record<Status, Tally>>
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
	readonly success: boolean
	readonly trace: readonly string[]
	readonly errors: readonly string[]
}

/** Describes semantic definition validation. */
export interface ProgramValidationResult {
	readonly valid: boolean
	readonly errors: readonly string[]
	readonly warnings: readonly string[]
}

/**
 * Describes the push observation surface of a {@link ProgramInterface}.
 *
 * @remarks
 * `rate` fires only when at least one line was selected. `determine` fires once
 * per notice, then once per applied limit. `decide` fires only when a decision
 * was reached.
 */
export type ProgramEventMap = {
	readonly qualify: readonly [result: QualificationResult]
	readonly rate: readonly [result: RatingResult]
	readonly determine: readonly [result: Determination]
	readonly decide: readonly [decision: Decision, result: ProgramResult]
	readonly execute: readonly [result: ProgramResult]
	readonly aggregate: readonly [result: AggregateResult]
	readonly destroy: readonly []
}

/**
 * Describes the options for `createProgram` / the `Program` constructor.
 *
 * @remarks
 * `qualifier` — an injected, caller-owned qualifier; created and owned by the
 * program when omitted. `rater` — an injected, caller-owned rater; created and
 * owned when omitted. `engine` — an injected, caller-owned reason engine;
 * created and owned when omitted. `validate` — if `true`, the program validates
 * the definition at construction; if `false`, it compiles the definition
 * unvalidated. Default: {@link DEFAULT_PROGRAM_VALIDATE}. `labels` —
 * field-to-label overrides for determination premises, keyed by dot-joined
 * field. `on` — initial emitter hooks. `error` — the emitter's listener-error
 * handler.
 */
export interface ProgramOptions {
	readonly qualifier?: QualifierInterface
	readonly rater?: RaterInterface
	readonly engine?: ReasonInterface
	readonly validate?: boolean
	readonly labels?: Readonly<Record<string, string>>
	readonly on?: EmitterHooks<ProgramEventMap>
	readonly error?: EmitterErrorHandler
}

/**
 * Defines one compiled program that composes one qualifier and one rater over a
 * shared reason engine.
 */
export interface ProgramInterface {
	/** Holds the authored id of the definition this program compiled. */
	readonly id: string
	/** Holds the authored display name of the definition this program compiled. */
	readonly name: string
	/** Holds the sealed snapshot of the authored definition this program compiled. */
	readonly definition: ProgramDefinition
	/**
	 * Holds the typed observation surface carrying `qualify`, `rate`, `determine`,
	 * `decide`, `execute`, `aggregate`, and `destroy`.
	 */
	readonly emitter: EmitterInterface<ProgramEventMap>
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
	validate(): ProgramValidationResult
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
	destroy(): void
}

/** Describes the push observation surface of a {@link ProgramManagerInterface}. */
export type ProgramManagerEventMap = {
	readonly add: readonly [id: string]
	readonly remove: readonly [id: string]
	readonly destroy: readonly []
}

/**
 * Describes the options for `createProgramManager` / the `ProgramManager` constructor.
 *
 * @remarks
 * `qualifier` — an injected, caller-owned qualifier; created and owned when
 * omitted. `rater` — an injected, caller-owned rater; created and owned when
 * omitted. `engine` — an injected, caller-owned reason engine; created and
 * owned when omitted. `programs` — seed definitions compiled in order.
 * `validate` — if `true`, the manager validates each seeded and added
 * definition; if `false`, it compiles each definition unvalidated.
 * Default: {@link DEFAULT_PROGRAM_VALIDATE}. `labels` — field-to-label
 * overrides for determination premises, keyed by dot-joined field. `on` —
 * initial emitter hooks. `error` — the emitter's listener-error handler.
 */
export interface ProgramManagerOptions {
	readonly qualifier?: QualifierInterface
	readonly rater?: RaterInterface
	readonly engine?: ReasonInterface
	readonly programs?: readonly ProgramDefinition[]
	readonly validate?: boolean
	readonly labels?: Readonly<Record<string, string>>
	readonly on?: EmitterHooks<ProgramManagerEventMap>
	readonly error?: EmitterErrorHandler
}

/** Defines an ordered manager over compiled programs, sharing one qualifier and rater. */
export interface ProgramManagerInterface {
	/**
	 * Holds the typed observation surface carrying `add`, `remove`, and `destroy`.
	 */
	readonly emitter: EmitterInterface<ProgramManagerEventMap>
	/**
	 * Holds how many programs the manager has compiled.
	 *
	 * @throws {@link ProgramError} Thrown when the manager has been destroyed
	 * (`'DESTROYED'`).
	 */
	readonly count: number
	/**
	 * Reports whether an id names a compiled program.
	 *
	 * @param id - The program id to look for
	 * @returns True if a compiled program carries the id; false otherwise
	 * @throws {@link ProgramError} Thrown when the manager has been destroyed
	 * (`'DESTROYED'`).
	 *
	 * @example
	 * ```ts
	 * import { createProgramManager } from '@orkestrel/program'
	 *
	 * const manager = createProgramManager({ programs: [definition] })
	 * manager.has('standard') // true
	 * manager.destroy()
	 * ```
	 */
	has(id: string): boolean
	/**
	 * Looks one compiled program up by id.
	 *
	 * @param id - The program id to look up
	 * @returns The compiled program, or `undefined` when no program carries the id
	 * @throws {@link ProgramError} Thrown when the manager has been destroyed
	 * (`'DESTROYED'`).
	 *
	 * @example
	 * ```ts
	 * import { createProgramManager } from '@orkestrel/program'
	 *
	 * const manager = createProgramManager({ programs: [definition] })
	 * manager.program('standard')?.execute({ id: 'risk-1', licensed: true })
	 * manager.destroy()
	 * ```
	 */
	program(id: string): ProgramInterface | undefined
	/**
	 * Returns every compiled program, in insertion order.
	 *
	 * @remarks
	 * The returned array is a fresh copy, so mutating it never reaches the manager's
	 * own collection.
	 *
	 * @returns A fresh array of compiled programs, in insertion order
	 * @throws {@link ProgramError} Thrown when the manager has been destroyed
	 * (`'DESTROYED'`).
	 *
	 * @example
	 * ```ts
	 * import { createProgramManager } from '@orkestrel/program'
	 *
	 * const manager = createProgramManager({ programs: [definition] })
	 * manager.programs().map((program) => program.id) // ['standard']
	 * manager.destroy()
	 * ```
	 */
	programs(): readonly ProgramInterface[]
	/**
	 * Compiles one definition and appends it to the collection.
	 *
	 * @remarks
	 * The compiled program borrows the manager's shared qualifier, rater, and reason
	 * engine, and inherits the manager's `validate` and `labels` options. After
	 * appending the program, the `add` event fires with its id.
	 *
	 * @param definition - The authored program definition to compile
	 * @returns The compiled program
	 * @throws {@link ProgramError} Thrown when the manager has been destroyed
	 * (`'DESTROYED'`).
	 * @throws {@link ProgramError} Thrown when the manager already carries the
	 * definition's id, or the definition repeats a rating-line or notice id
	 * (`'DUPLICATE'`).
	 * @throws {@link ProgramError} Thrown when a ruling or notice scope names no
	 * rating line (`'MISSING'`).
	 * @throws {@link ProgramError} Thrown when validation is enabled and the
	 * definition fails (`'DEFINITION'`).
	 *
	 * @example
	 * ```ts
	 * import { createProgramManager } from '@orkestrel/program'
	 *
	 * const manager = createProgramManager()
	 * manager.add(definition).id // 'standard'
	 * manager.destroy()
	 * ```
	 */
	add(definition: ProgramDefinition): ProgramInterface
	// Array overload first so an id list resolves to the batch form.
	/**
	 * Removes every listed id, destroying each removed program.
	 *
	 * @remarks
	 * Every id is attempted, so one absent id does not stop the rest. Each removal
	 * destroys its program and fires `remove` with that id. An empty list succeeds
	 * vacuously.
	 *
	 * @param ids - The program ids to remove
	 * @returns True if every listed id named a compiled program; false otherwise
	 * @throws {@link ProgramError} Thrown when the manager has been destroyed
	 * (`'DESTROYED'`).
	 *
	 * @example
	 * ```ts
	 * import { createProgramManager } from '@orkestrel/program'
	 *
	 * const manager = createProgramManager({ programs: [definition] })
	 * manager.remove(['standard', 'absent']) // false
	 * manager.destroy()
	 * ```
	 */
	remove(ids: readonly string[]): boolean
	/**
	 * Removes one id, destroying the program it named.
	 *
	 * @param id - The program id to remove
	 * @returns True if the id named a compiled program; false otherwise
	 * @throws {@link ProgramError} Thrown when the manager has been destroyed
	 * (`'DESTROYED'`).
	 *
	 * @example
	 * ```ts
	 * import { createProgramManager } from '@orkestrel/program'
	 *
	 * const manager = createProgramManager({ programs: [definition] })
	 * manager.remove('standard') // true
	 * manager.destroy()
	 * ```
	 */
	remove(id: string): boolean
	/**
	 * Removes every compiled program, destroying each one.
	 *
	 * @remarks
	 * Each removal fires `remove` with that program's id. The manager itself stays
	 * usable, so a later `add` compiles into the drained collection.
	 *
	 * @throws {@link ProgramError} Thrown when the manager has been destroyed
	 * (`'DESTROYED'`).
	 *
	 * @example
	 * ```ts
	 * import { createProgramManager } from '@orkestrel/program'
	 *
	 * const manager = createProgramManager({ programs: [definition] })
	 * manager.remove()
	 * manager.destroy()
	 * ```
	 */
	remove(): void
	/**
	 * Destroys this manager, idempotently.
	 *
	 * @remarks
	 * The destroyed flag is set BEFORE any teardown or the `remove` and `destroy`
	 * events, so a `remove` listener re-entering `destroy` is a no-op. Compiled
	 * programs are destroyed first, then an owned qualifier, rater, and reason engine;
	 * an injected one stays caller-owned. The emitter is torn down last, and stays
	 * reachable afterwards.
	 *
	 * @example
	 * ```ts
	 * import { createProgramManager } from '@orkestrel/program'
	 *
	 * const manager = createProgramManager({ programs: [definition] })
	 * manager.destroy()
	 * manager.destroy() // a second call is a no-op
	 * ```
	 */
	destroy(): void
}
