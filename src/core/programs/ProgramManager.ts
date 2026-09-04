import type { EmitterInterface } from '@orkestrel/emitter'
import type { QualifierInterface } from '@orkestrel/qualifier'
import type { RaterInterface } from '@orkestrel/rater'
import type { ReasonInterface } from '@orkestrel/reason'
import type {
	ProgramDefinition,
	ProgramInterface,
	ProgramManagerEventMap,
	ProgramManagerInterface,
	ProgramManagerOptions,
} from '../types.js'
import { Emitter } from '@orkestrel/emitter'
import { createQualifier } from '@orkestrel/qualifier'
import { createRater } from '@orkestrel/rater'
import { createLogicalReasoner, createQuantitativeReasoner, createReason } from '@orkestrel/reason'
import { DEFAULT_PROGRAM_VALIDATE } from '../constants.js'
import { ProgramError } from '../errors.js'
import { createProgram } from '../factories.js'

/**
 * Manages compiled {@link ProgramInterface} programs in order, sharing one
 * qualifier, rater, and reason engine across every program it compiles.
 *
 * @remarks
 * OWNS its ordered `#programs` collection and its own {@link Emitter} over
 * {@link ProgramManagerEventMap}. Creates or borrows one shared engine, qualifier,
 * and rater and injects the same instances into every compiled program. `remove`
 * destroys the programs it removes; `destroy()` removes all programs, then
 * destroys only the owned shared dependencies, and tears the emitter down LAST.
 * A seed-program failure during construction tears the manager down (destroying
 * whatever had already been compiled) before rethrowing the original error.
 * `destroy()` is REENTRANCY-SAFE — the destroyed flag is set BEFORE any teardown
 * or the `remove` / `destroy` events fire, so a `remove` listener that re-enters
 * `destroy()` is a no-op. Every call after `destroy()` throws {@link ProgramError}
 * `'DESTROYED'`.
 */
export class ProgramManager implements ProgramManagerInterface {
	readonly #emitter: Emitter<ProgramManagerEventMap>
	readonly #programs: ProgramInterface[] = []
	readonly #qualifier: QualifierInterface
	readonly #rater: RaterInterface
	readonly #engine: ReasonInterface
	readonly #qualifierOwned: boolean
	readonly #raterOwned: boolean
	readonly #engineOwned: boolean
	readonly #validate: boolean
	readonly #labels: Readonly<Record<string, string>> | undefined
	#destroyed = false

	/**
	 * Creates one manager and compiles every seed definition in order.
	 *
	 * @param options - Optional injected qualifier, rater, engine, seed programs, validation, labels, and emitter hooks
	 * @throws {@link ProgramError} Thrown when a seed definition fails to compile,
	 * after the manager destroys whatever it had already compiled.
	 */
	constructor(options?: ProgramManagerOptions) {
		this.#emitter = new Emitter({
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		this.#labels = options?.labels
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

		try {
			for (const definition of options?.programs ?? []) this.add(definition)
		} catch (error) {
			this.destroy()
			throw error
		}
	}

	/**
	 * Holds the typed observation surface carrying `add`, `remove`, and `destroy`.
	 *
	 * @returns The emitter this manager owns
	 *
	 * @example
	 * ```ts
	 * import { createProgramManager } from '@orkestrel/program'
	 *
	 * const manager = createProgramManager()
	 * manager.emitter.on('add', (id) => id)
	 * manager.destroy()
	 * ```
	 */
	get emitter(): EmitterInterface<ProgramManagerEventMap> {
		return this.#emitter
	}

	/**
	 * Holds how many programs the manager has compiled.
	 *
	 * @returns The number of compiled programs
	 * @throws {@link ProgramError} Thrown when the manager has been destroyed
	 * (`'DESTROYED'`).
	 *
	 * @example
	 * ```ts
	 * import { createProgramManager } from '@orkestrel/program'
	 *
	 * const manager = createProgramManager({ programs: [definition] })
	 * manager.count // 1
	 * manager.destroy()
	 * ```
	 */
	get count(): number {
		this.#alive()
		return this.#programs.length
	}

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
	has(id: string): boolean {
		this.#alive()
		return this.#programs.some((program) => program.id === id)
	}

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
	program(id: string): ProgramInterface | undefined {
		this.#alive()
		return this.#programs.find((program) => program.id === id)
	}

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
	programs(): readonly ProgramInterface[] {
		this.#alive()
		return [...this.#programs]
	}

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
	add(definition: ProgramDefinition): ProgramInterface {
		this.#alive()
		if (this.has(definition.id)) {
			throw new ProgramError(
				'DUPLICATE',
				`Program "${definition.id}" already exists`,
				definition.id,
			)
		}
		const program = createProgram(definition, {
			qualifier: this.#qualifier,
			rater: this.#rater,
			engine: this.#engine,
			validate: this.#validate,
			...(this.#labels === undefined ? {} : { labels: this.#labels }),
		})
		this.#programs.push(program)
		this.#emitter.emit('add', program.id)
		return program
	}

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
	remove(input?: string | readonly string[]): boolean | void {
		this.#alive()
		if (input === undefined) {
			this.#drain()
			return
		}
		if (Array.isArray(input)) {
			let removed = true
			for (const id of input) removed = this.#removeOne(id) && removed
			return removed
		}
		if (typeof input === 'string') return this.#removeOne(input)
	}

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
	destroy(): void {
		if (this.#destroyed) return
		this.#destroyed = true
		this.#drain()
		if (this.#qualifierOwned) this.#qualifier.destroy()
		if (this.#raterOwned) this.#rater.destroy()
		if (this.#engineOwned) this.#engine.destroy()
		this.#emitter.emit('destroy')
		this.#emitter.destroy()
	}

	#drain(): void {
		for (const program of this.#programs.splice(0)) {
			program.destroy()
			this.#emitter.emit('remove', program.id)
		}
	}

	#removeOne(id: string): boolean {
		const index = this.#programs.findIndex((program) => program.id === id)
		if (index < 0) return false
		const removed = this.#programs.splice(index, 1)[0]
		if (removed === undefined) return false
		removed.destroy()
		this.#emitter.emit('remove', removed.id)
		return true
	}

	#alive(): void {
		if (this.#destroyed) {
			throw new ProgramError('DESTROYED', 'Program manager has been destroyed')
		}
	}
}
