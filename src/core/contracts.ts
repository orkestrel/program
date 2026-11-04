import type { ContractInterface } from '@orkestrel/contract'
import { createContract } from '@orkestrel/contract'
import { aggregateResultShape, programResultShape } from './shapers.js'

/** Publishes a `ProgramResult`'s JSON projection as a contract, read through `projectProgramResult`. */
export const programResultContract: ContractInterface<unknown> = createContract(programResultShape)

/** Publishes an `AggregateResult`'s JSON projection as a contract, read through `projectAggregateResult`. */
export const aggregateResultContract: ContractInterface<unknown> =
	createContract(aggregateResultShape)
