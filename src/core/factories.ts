import type {
	ProgramDefinition,
	ProgramInterface,
	ProgramManagerInterface,
	ProgramManagerOptions,
	ProgramOptions,
} from './types.js'
import { Program } from './programs/Program.js'
import { ProgramManager } from './programs/ProgramManager.js'

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
 * import { buildProgramDefinition, createProgram } from '@orkestrel/program'
 *
 * const definition = buildProgramDefinition('standard', 'Standard', qualification, rating)
 * const program = createProgram(definition)
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
