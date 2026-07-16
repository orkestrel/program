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

/** A final authority outcome, derived from global eligibility. */
export type Decision = 'approved' | 'denied' | 'submitted'

/** The presentation and tally status derived from eligibility, conditions, and rating success. */
export type Status = 'ineligible' | 'referral' | 'conditional' | 'unrated' | 'eligible'

/** A post-qualification program determination effect. */
export type ProgramEffect = 'notice' | 'limit'

/** A coded {@link ProgramError} programmer-error code. */
export type ProgramErrorCode =
	| 'DUPLICATE'
	| 'MISSING'
	| 'DEFINITION'
	| 'MISMATCH'
	| 'RESERVED'
	| 'DESTROYED'

/** Optional fields accepted by `noticeDefinition`. */
export interface NoticeInput {
	readonly scope?: string
}

/** Optional fields accepted by `aggregateDefinition`. */
export interface AggregateInput {
	readonly by?: FieldPath
	readonly gates?: LogicalDefinition
}

/** Optional fields accepted by `programDefinition`. */
export interface ProgramInput {
	readonly description?: string
	readonly notices?: readonly Notice[]
	readonly authority?: LogicalDefinition
	readonly aggregate?: AggregateDefinition
	readonly metadata?: JSONValue
}

/** An authored, unconditional program notice. */
export interface Notice {
	readonly id: string
	readonly message: string
	readonly scope?: string
}

/** One resolved notice or authority-limit outcome. */
export interface Determination {
	readonly id: string
	readonly effect: ProgramEffect
	readonly applied: boolean
	readonly scope?: string
	readonly message?: string
	readonly premises: readonly Premise[]
}

/** Batch aggregate fields, an optional partition key, and optional gates. */
export interface AggregateDefinition {
	readonly fields: readonly FieldPath[]
	readonly by?: FieldPath
	readonly gates?: LogicalDefinition
}

/** One subject's private aggregate working projection. */
export interface AggregateProjection {
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
	readonly group?: AggregateGroup
}

/** One batch aggregate partition. */
export interface AggregateGroup {
	readonly key: string
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
}

/** A status tally — a count plus summed aggregate fields. */
export interface Tally {
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
}

/**
 * A pure authored program definition.
 *
 * @remarks
 * `qualification` runs first through `@orkestrel/qualifier`; `rating` runs only
 * over the lines scoped eligibility left standing, through `@orkestrel/rater`.
 * `authority` (a logical definition) runs last, over the assembled result
 * extended with an outcome projection, to derive limit determinations and the
 * final decision.
 */
export interface ProgramDefinition {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly qualification: QualificationDefinition
	readonly rating: RatingDefinition
	readonly notices?: readonly Notice[]
	readonly authority?: LogicalDefinition
	readonly aggregate?: AggregateDefinition
	readonly metadata?: JSONValue
}

/** One subject's complete program outcome. */
export interface ProgramResult {
	readonly id: string
	readonly name: string
	readonly eligibility: Eligibility
	readonly status: Status
	/**
	 * @remarks
	 * Present ONLY when the program HAS an `authority`, the authority result is
	 * `logical`, no `limit` determinations fired, and status is not `unrated`.
	 */
	readonly decision?: Decision
	readonly qualification: QualificationResult
	readonly rating?: RatingResult
	readonly determinations: readonly Determination[]
	readonly success: boolean
	readonly trace: readonly string[]
	readonly errors: readonly string[]
}

/** A batch program outcome across every subject. */
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

/** Semantic definition validation. */
export interface ProgramValidationResult {
	readonly valid: boolean
	readonly errors: readonly string[]
	readonly warnings: readonly string[]
}

/**
 * The push observation surface of a {@link ProgramInterface} (AGENTS §13).
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

/** Options for `createProgram` / the `Program` constructor. */
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
 * One compiled program — composes one qualifier and one rater over a shared
 * reason engine.
 *
 * @remarks
 * The array-of-subjects `execute` overload is declared FIRST (AGENTS §9.2) so a
 * subject list resolves to one aggregate-aware batch execution.
 */
export interface ProgramInterface {
	readonly id: string
	readonly name: string
	readonly definition: ProgramDefinition
	readonly emitter: EmitterInterface<ProgramEventMap>
	execute(subjects: Subject[]): AggregateResult
	execute(subject: Subject): ProgramResult
	validate(): ProgramValidationResult
	destroy(): void
}

/** The push observation surface of a {@link ProgramManagerInterface} (AGENTS §13). */
export type ProgramManagerEventMap = {
	readonly add: readonly [id: string]
	readonly remove: readonly [id: string]
	readonly destroy: readonly []
}

/** Options for `createProgramManager` / the `ProgramManager` constructor. */
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

/** An ordered manager over compiled programs (AGENTS §9), sharing one qualifier and rater. */
export interface ProgramManagerInterface {
	readonly emitter: EmitterInterface<ProgramManagerEventMap>
	readonly size: number
	has(id: string): boolean
	program(id: string): ProgramInterface | undefined
	programs(): readonly ProgramInterface[]
	add(definition: ProgramDefinition): ProgramInterface
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	destroy(): void
}
