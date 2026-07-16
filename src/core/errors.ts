import type { ProgramErrorCode } from './types.js'

/**
 * A coded programmer error thrown by the program layer.
 *
 * @remarks
 * `DUPLICATE` — a program id collision on `ProgramManager.add`, or a duplicate
 * authored rating-line or notice id. `MISSING` — an
 * authored notice or qualification ruling scope names no rating line.
 * `DEFINITION` — a program, qualification, rating, authority, or aggregate
 * policy failed validation. `MISMATCH` — an injected entity or a returned
 * reason result has the wrong contract. `RESERVED` — a subject already
 * carries `aggregate` or `outcome`. `DESTROYED` — use of a destroyed entity.
 */
export class ProgramError extends Error {
	readonly code: ProgramErrorCode
	readonly context?: unknown

	constructor(code: ProgramErrorCode, message: string, context?: unknown) {
		super(message)
		this.name = 'ProgramError'
		this.code = code
		this.context = context
	}
}

/** Narrow a caught value to a {@link ProgramError}. */
export function isProgramError(value: unknown): value is ProgramError {
	return value instanceof ProgramError
}
