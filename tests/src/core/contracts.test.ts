import {
	literalShape,
	objectShape,
	seededRandom,
	stringShape,
	unionShape,
} from '@orkestrel/contract'
import {
	createProgram,
	createProgramDefinitionContract,
	isProgramDefinition,
	isProgramResult,
	isAggregateResult,
	programResultContract,
	aggregateResultContract,
	projectProgramResult,
	projectAggregateResult,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	buildProgramContractCases,
	collectCorpusDefinitions,
	standardProgramDefinition,
} from '../../setup.js'

describe('standing guard contract table', () => {
	const table = buildProgramContractCases()

	it('canonical positives and negative controls declare direction and projection', () => {
		for (const row of table.definitions) {
			expect(row.direction).toBe('is implies guard')
			expect(row.project).toBeUndefined()
			expect(row.wire.is(row.positive)).toBe(true)
			expect(row.guard(row.positive)).toBe(true)
			expect(row.wire.is(row.negative)).toBe(false)
			expect(row.guard(row.negative)).toBe(false)
		}
		for (const row of table.results) {
			expect(row.direction).toBe('producer implies wire after projection')
			expect(row.guard(row.positive)).toBe(true)
			expect(row.wire.is(row.project())).toBe(true)
			expect(row.wire.is(row.negative)).toBe(false)
			expect(row.guard(row.negative)).toBe(false)
			expect(row.guard({ ...row.positive, extension: 1 })).toBe(true)
		}
	})

	it.each(table.definitions)(
		'$name: generated admissions imply the guard without discards',
		(row) => {
			const admissions = Array.from({ length: 100 }, (_, seed) => {
				const value = row.wire.generate(seededRandom(seed))
				return { seed, admitted: row.wire.is(value), guarded: row.guard(value) }
			})
			expect(admissions.filter((entry) => !entry.admitted)).toEqual([])
			expect(admissions.filter((entry) => !entry.guarded)).toEqual([])
		},
	)

	it('refuses malformed nested shapes alongside the structural guard', () => {
		const wire = createProgramDefinitionContract()
		for (const shape of [42, null, {}, { type: 'nonsense' }]) {
			const value = { ...standardProgramDefinition, shape }
			expect(wire.is(value)).toBe(false)
			expect(isProgramDefinition(value)).toBe(false)
		}
	})

	it('carries hinted union faults from the subject door across both result contracts', () => {
		const shape = objectShape({
			pick: unionShape(
				objectShape({ kind: literalShape(['a']), value: stringShape() }),
				objectShape({ kind: literalShape(['b']), value: stringShape() }),
			),
		})
		const program = createProgram({ ...standardProgramDefinition, shape }, { validate: false })
		try {
			const single = program.execute({ pick: { kind: 'c' } })
			const batch = program.execute([{ pick: { kind: 'c' } }])
			expect(single.success).toBe(false)
			expect(single.faults).toContainEqual({
				reason: 'variant',
				path: ['pick'],
				variants: 2,
				key: 'kind',
				expected: ['a', 'b'],
			})
			expect(programResultContract.is(projectProgramResult(single))).toBe(true)
			expect(aggregateResultContract.is(projectAggregateResult(batch))).toBe(true)
			expect(programResultContract.is(single)).toBe(true)
			for (const reason of ['unrecognized', undefined]) {
				expect(programResultContract.is({ ...single, faults: [{ reason, path: [] }] })).toBe(false)
			}
		} finally {
			program.destroy()
		}
	})

	it('corpus producers cross the wire on single and batch outcomes', () => {
		for (const definition of collectCorpusDefinitions().filter(
			(entry) => entry.id !== 'eligibility-only-notice-missing',
		)) {
			const program = createProgram(definition, { validate: false })
			try {
				for (const subject of [{}, { age: 30, amount: 100 }, { age: NaN, amount: Infinity }]) {
					const single = program.execute(subject)
					const batch = program.execute([subject])
					expect(isProgramResult(single)).toBe(true)
					expect(programResultContract.is(projectProgramResult(single))).toBe(true)
					expect(isAggregateResult(batch)).toBe(true)
					expect(aggregateResultContract.is(projectAggregateResult(batch))).toBe(true)
				}
			} finally {
				program.destroy()
			}
		}
	})

	it('refuses the corpus definition with an unknown scope', () => {
		const definition = collectCorpusDefinitions().find(
			(entry) => entry.id === 'eligibility-only-notice-missing',
		)
		if (definition === undefined) throw new Error('Missing scope refusal fixture')
		expect(() => createProgram(definition)).toThrow('Unknown rating line reference: base')
	})
})
