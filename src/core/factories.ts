import type { FieldPath } from '@orkestrel/contract'
import type { QualificationDefinition } from '@orkestrel/qualifier'
import type { RatingDefinition } from '@orkestrel/rater'
import type {
	AggregateDefinition,
	AggregateInput,
	Notice,
	NoticeInput,
	ProgramDefinition,
	ProgramInput,
	ProgramInterface,
	ProgramManagerInterface,
	ProgramManagerOptions,
	ProgramOptions,
} from './types.js'
import { Program } from './programs/Program.js'
import { ProgramManager } from './programs/ProgramManager.js'
import { copyJSONValue } from './helpers.js'

/**
 * Create one compiled program over a qualifier and rater.
 *
 * @remarks
 * Validates the definition at construction when `options.validate` is left at
 * its {@link DEFAULT_PROGRAM_VALIDATE} default. A standalone program creates and
 * OWNS one shared quantitative-plus-logical reason engine and injects it into the
 * qualifier and rater it creates; injected dependencies remain caller-owned.
 *
 * @param definition - The authored program definition
 * @param options - Optional injected qualifier, rater, engine, validation, labels, and emitter hooks
 * @returns A {@link ProgramInterface}
 *
 * @example
 * ```ts
 * import { createProgram, programDefinition } from '@orkestrel/program'
 *
 * const program = createProgram(programDefinition('standard', 'Standard', qualification, rating))
 * program.execute({ id: 'risk-1' })
 * program.destroy()
 * ```
 */
export function createProgram(
	definition: ProgramDefinition,
	options?: ProgramOptions,
): ProgramInterface {
	return new Program(definition, options)
}

/**
 * Create one ordered manager over compiled programs.
 *
 * @remarks
 * Creates or borrows one shared reason engine, qualifier, and rater and injects
 * them into every compiled program, so a batch of definitions shares one engine.
 * Seed definitions are compiled in order.
 *
 * @param options - Optional injected qualifier, rater, engine, seed programs, validation, labels, and emitter hooks
 * @returns A {@link ProgramManagerInterface}
 *
 * @example
 * ```ts
 * import { createProgramManager } from '@orkestrel/program'
 *
 * const manager = createProgramManager({ programs: [definition] })
 * manager.program('standard')?.execute(subject)
 * manager.destroy()
 * ```
 */
export function createProgramManager(options?: ProgramManagerOptions): ProgramManagerInterface {
	return new ProgramManager(options)
}

/**
 * Build a {@link ProgramDefinition}.
 *
 * @remarks
 * Copies every collection and omits absent optional keys, so the returned
 * definition is a fresh, JSON-serializable value that never aliases its inputs.
 *
 * @param id - The program id
 * @param name - The display name
 * @param qualification - The nested qualification definition
 * @param rating - The nested rating definition
 * @param input - Optional description, notices, authority, aggregate, and metadata
 * @returns A fresh program definition
 *
 * @example
 * ```ts
 * import { programDefinition } from '@orkestrel/program'
 *
 * programDefinition('standard', 'Standard', qualification, rating, { notices: [notice] })
 * ```
 */
export function programDefinition(
	id: string,
	name: string,
	qualification: QualificationDefinition,
	rating: RatingDefinition,
	input?: ProgramInput,
): ProgramDefinition {
	return {
		id,
		name,
		qualification,
		rating,
		...(input?.description === undefined ? {} : { description: input.description }),
		...(input?.notices === undefined ? {} : { notices: [...input.notices] }),
		...(input?.authority === undefined ? {} : { authority: input.authority }),
		...(input?.aggregate === undefined ? {} : { aggregate: input.aggregate }),
		...(input?.metadata === undefined ? {} : { metadata: copyJSONValue(input.metadata) }),
	}
}

/**
 * Build a {@link Notice}.
 *
 * @param id - The notice id
 * @param message - The message template, carrying optional `{{token}}`s
 * @param input - Optional presentation scope
 * @returns A fresh notice
 *
 * @example
 * ```ts
 * import { noticeDefinition } from '@orkestrel/program'
 *
 * noticeDefinition('minimum', 'Minimum earned premium applies')
 * ```
 */
export function noticeDefinition(id: string, message: string, input?: NoticeInput): Notice {
	return {
		id,
		message,
		...(input?.scope === undefined ? {} : { scope: input.scope }),
	}
}

/**
 * Build an {@link AggregateDefinition}.
 *
 * @param fields - The aggregate fields to sum across a batch
 * @param input - Optional partition field and aggregate gates
 * @returns A fresh aggregate definition
 *
 * @example
 * ```ts
 * import { aggregateDefinition } from '@orkestrel/program'
 *
 * aggregateDefinition(['amount'], { by: 'location' })
 * ```
 */
export function aggregateDefinition(
	fields: readonly FieldPath[],
	input?: AggregateInput,
): AggregateDefinition {
	return {
		fields: [...fields],
		...(input?.by === undefined ? {} : { by: input.by }),
		...(input?.gates === undefined ? {} : { gates: input.gates }),
	}
}
