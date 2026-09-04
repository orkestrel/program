import type { ProgramErrorCode } from './types.js'

/**
 * Reports a coded programmer error thrown by the program layer.
 *
 * @remarks
 * `DUPLICATE` — a program id collision on `ProgramManager.add`, or a duplicate
 * authored rating-line or notice id. `MISSING` — an
 * authored notice or qualification ruling scope names no rating line.
 * `DEFINITION` — a program, qualification, rating, authority, or aggregate
 * policy failed validation. `MISMATCH` — an injected entity or a returned
 * reason result has the wrong contract. `RESERVED` — a subject already
 * carries `aggregate` or `outcome`. `DESTROYED` — use of a destroyed entity.
 *
 * @example
 * ```ts
 * import { ProgramError } from '@orkestrel/program'
 *
 * const error = new ProgramError('RESERVED', 'Subject carries a reserved key', 'aggregate')
 * error.code // 'RESERVED'
 * ```
 */
export class ProgramError extends Error {
	readonly code: ProgramErrorCode
	readonly context?: unknown

	/**
	 * Creates a coded program error.
	 *
	 * @param code - The machine-readable failure category
	 * @param message - The human-readable failure description
	 * @param context - Optional structured context for the failure
	 * @param cause - Optional underlying value the failure wraps
	 */
	constructor(code: ProgramErrorCode, message: string, context?: unknown, cause?: unknown) {
		super(message, cause === undefined ? undefined : { cause })
		this.name = 'ProgramError'
		this.code = code
		this.context = context
	}
}

/**
 * Determines whether a caught value is a {@link ProgramError}.
 *
 * @param value - The candidate value
 * @returns True if the value is a {@link ProgramError}; false otherwise
 *
 * @example
 * ```ts
 * import { isProgramError, ProgramError } from '@orkestrel/program'
 *
 * isProgramError(new ProgramError('RESERVED', 'Subject carries a reserved key')) // true
 * isProgramError(new Error('Subject carries a reserved key')) // false
 * ```
 */
export function isProgramError(value: unknown): value is ProgramError {
	return value instanceof ProgramError
}
