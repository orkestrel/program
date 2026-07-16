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
 * An ordered manager over compiled {@link ProgramInterface}s (AGENTS §9), sharing
 * one qualifier, rater, and reason engine across every program it compiles.
 *
 * @remarks
 * OWNS its ordered `#programs` collection and its own {@link Emitter} over
 * {@link ProgramManagerEventMap}. Creates or borrows one shared engine, qualifier,
 * and rater and injects the same instances into every compiled program. `remove`
 * destroys the programs it removes; `destroy()` removes all programs, then
 * destroys only the owned shared dependencies, and tears the emitter down LAST.
 * Every call after `destroy()` throws {@link ProgramError} `'DESTROYED'`.
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

	constructor(options?: ProgramManagerOptions) {
		this.#emitter = new Emitter({ on: options?.on, error: options?.error })
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

		for (const definition of options?.programs ?? []) this.add(definition)
	}

	get emitter(): EmitterInterface<ProgramManagerEventMap> {
		return this.#emitter
	}

	get size(): number {
		this.#alive()
		return this.#programs.length
	}

	has(id: string): boolean {
		this.#alive()
		return this.#programs.some((program) => program.id === id)
	}

	program(id: string): ProgramInterface | undefined {
		this.#alive()
		return this.#programs.find((program) => program.id === id)
	}

	programs(): readonly ProgramInterface[] {
		this.#alive()
		return [...this.#programs]
	}

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
			labels: this.#labels,
		})
		this.#programs.push(program)
		this.#emitter.emit('add', program.id)
		return program
	}

	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	remove(input?: string | readonly string[]): boolean | void {
		this.#alive()
		if (input === undefined) {
			for (const program of this.#programs.splice(0)) {
				program.destroy()
				this.#emitter.emit('remove', program.id)
			}
			return
		}
		if (Array.isArray(input)) {
			let removed = true
			for (const id of input) removed = this.#removeOne(id) && removed
			return removed
		}
		if (typeof input === 'string') return this.#removeOne(input)
	}

	destroy(): void {
		if (this.#destroyed) return
		this.remove()
		if (this.#qualifierOwned) this.#qualifier.destroy()
		if (this.#raterOwned) this.#rater.destroy()
		if (this.#engineOwned) this.#engine.destroy()
		this.#destroyed = true
		this.#emitter.emit('destroy')
		this.#emitter.destroy()
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
