import type { ContractInterface } from '@orkestrel/contract'
import type {
	ProgramDefinition,
	ProgramInterface,
	ProgramManagerInterface,
	ProgramManagerOptions,
	ProgramOptions,
} from './types.js'
import { createContract } from '@orkestrel/contract'
import { createProgramDefinitionShape } from './shapers.js'
import { Program } from './programs/Program.js'
import { ProgramManager } from './programs/ProgramManager.js'

/**
 * Creates one compiled {@link ProgramInterface} over a qualifier and rater.
 *
 * @remarks
 * If `options.validate` is `true`, the program validates the definition at
 * construction; if `false`, it compiles the definition unvalidated. Default:
 * {@link DEFAULT_PROGRAM_VALIDATE}. A standalone program creates and owns one
 * shared quantitative-plus-logical reason engine and injects it into the qualifier
 * and rater it creates; injected dependencies remain caller-owned.
 *
 * @param definition - The authored program definition
 * @param options - Optional injected qualifier, rater, engine, validation, labels, and emitter hooks
 * @returns A {@link ProgramInterface}
 *
 * @example Compile a program and a manager
 * ```ts
 * import { buildProgramDefinition, createProgram, createProgramManager } from '@orkestrel/program'
 *
 * const definition = buildProgramDefinition('standard', 'Standard', qualification, rating)
 *
 * const program = createProgram(definition)
 * const manager = createProgramManager({ programs: [definition] })
 *
 * program.execute({ id: 'risk-1' })
 *
 * program.destroy()
 * manager.destroy()
 * ```
 */
export function createProgram(
	definition: ProgramDefinition,
	options?: ProgramOptions,
): ProgramInterface {
	return new Program(definition, options)
}

/**
 * Creates one ordered {@link ProgramManagerInterface} over compiled programs.
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
 * Creates a `ProgramDefinition` as a contract. Cross it on `is`, never `parse`.
 *
 * @remarks
 * A function because a logical definition's shape is recursive and costs at import. `is` reads a
 * nested `shape` as any JSON value and the guard reads it as a shape, so a definition crossing a
 * boundary goes through `isProgramDefinition` as well.
 *
 * @returns The program definition's contract
 *
 * @example
 * ```ts
 * import { createProgramDefinitionContract } from '@orkestrel/program'
 *
 * createProgramDefinitionContract().is({ id: 'p' }) // false
 * ```
 */
export function createProgramDefinitionContract(): ContractInterface<unknown> {
	return createContract(createProgramDefinitionShape())
}
