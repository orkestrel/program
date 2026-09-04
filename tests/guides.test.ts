// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The constants declared next are this
// package's own, and are the only part a sibling package changes.

import { describe, expect, it } from 'vitest'
import { buildProgramDefinition, createProgram } from '@src/core'
import { createQualificationDefinition, createRuling } from '@orkestrel/qualifier'
import { buildLineDefinition, buildRatingDefinition } from '@orkestrel/rater'
import {
	createAtom,
	createFactorGroup,
	createLogicalDefinition,
	createQuantitativeDefinition,
	createRule,
	createStaticFactor,
} from '@orkestrel/reason'
import {
	computeSymbolKey,
	createGuide,
	createSource,
	createSourceManager,
	extractFenceImports,
	findMissing,
	findMissingSymbols,
	findUnexampled,
	findUnlisted,
	isExternalLink,
	parseManifest,
	resolveLink,
} from '@orkestrel/guide'
import { readFileSync } from 'node:fs'
import { requireValue } from '@orkestrel/test'
import { readInventory } from '@orkestrel/test/server'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['text', 'ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ '@orkestrel/program': 'src/core' })
/** The guide whose flagship fences the executed cases transcribe. */
const CORE_GUIDE = 'guides/program.md'
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the internal-symbol assertion fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

/** Root-level files this package's guides link to. `readInventory` walks directories only. */
const ROOT_FILES = Object.freeze(['AGENTS.md'])

const root = new URL('../', import.meta.url)
const files: Record<string, string> = {
	...readInventory(root, ['src', 'guides', 'tests'], { extensions: ['.ts', '.md'] }),
}
for (const name of ROOT_FILES) files[name] = readFileSync(new URL(name, root), 'utf8')
const manifest = parseManifest(
	requireValue(files['guides/README.md'], 'Missing file: guides/README.md'),
	'guides',
)
const sources = createSourceManager({ files, modules: MODULES })

it('manifest lists at least one guide', () => {
	expect(manifest.length).toBeGreaterThan(0)
})

for (const entry of manifest) {
	const guide = createGuide(requireValue(files[entry.spec], `Missing file: ${entry.spec}`))
	const source = createSource({ files, module: entry.source })

	describe(`${entry.concept}`, () => {
		it('uses only listed fence languages', () => {
			expect(findUnlisted(guide.fences(), FENCE_LANGUAGES)).toEqual([])
		})

		it('extracts a non-empty documented surface', () => {
			expect(guide.surface().length).toBeGreaterThan(0)
		})
		it('re-exports every direct declaration that is not named internal', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(stranded.filter((key) => !INTERNAL.includes(key))).toEqual([])
		})
		it('names no symbol internal that the barrel already exports', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(INTERNAL.filter((key) => !stranded.includes(key))).toEqual([])
		})
		it('re-exports only direct declarations', () => {
			expect(findMissingSymbols(source.surface(), source.exports())).toEqual([])
		})
		it('documents every barrel export', () => {
			expect(findMissingSymbols(source.surface(), guide.surface())).toEqual([])
		})
		it('documents only barrel exports', () => {
			expect(findMissingSymbols(guide.surface(), source.surface())).toEqual([])
		})

		it('exposes no hidden module-scope declarations', () => {
			expect(source.hidden().map(computeSymbolKey)).toEqual([])
		})

		for (const group of guide.methods()) {
			const members = source.methods(group.interface)
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface}`, () => {
				it('documents at least one method', () => {
					expect(group.methods.length).toBeGreaterThan(0)
				})
				it('documents every interface method', () => {
					expect(findMissing(members, group.methods)).toEqual([])
				})
				it('documents no phantom method', () => {
					expect(findMissing(group.methods, members)).toEqual([])
				})
				it(`${entity} exposes no undocumented method`, () => {
					const extra =
						entity === group.interface ? [] : findMissing(source.methods(entity), group.methods)
					expect(extra).toEqual([])
				})
			})
		}

		it('documents an example for every Surface function', () => {
			const fences = guide
				.fences()
				.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
				.map((fence) => fence.code)
			const names = guide
				.surface()
				.filter((symbol) => symbol.keyword === 'function')
				.map((symbol) => symbol.name)
			expect(findUnexampled(names, fences, source.examples())).toEqual([])
		})

		for (const group of guide.methods()) {
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface} examples`, () => {
				it('documents an example for every method', () => {
					const fences = guide
						.fences()
						.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
						.map((fence) => fence.code)
					const examples =
						entity === group.interface
							? source.examples(group.interface)
							: source.examples(group.interface).concat(source.examples(entity))
					expect(findUnexampled(group.methods, fences, examples)).toEqual([])
				})
			})
		}

		it('imports only real exports in every ```ts fence', () => {
			const fences = guide.fences().filter((fence) => fence.language === EXAMPLE_LANGUAGE)
			for (const fence of fences) {
				for (const { specifier, names } of extractFenceImports(fence.code)) {
					const imported = sources.source(specifier)
					if (imported === undefined) continue
					const surface = imported.surface().map((symbol) => symbol.name)
					expect(findMissing(names, surface)).toEqual([])
				}
			}
		})

		it('resolves every relative link', () => {
			const broken = guide
				.links()
				.filter((href) => !isExternalLink(href))
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(broken).toEqual([])
		})
		it('links only to test files that exist', () => {
			const missing = guide
				.tests()
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(missing).toEqual([])
		})
	})
}

// The EXECUTED half of this file. Every check up to here reads a name — from the guide
// text or from the barrel — and a name that resolves proves nothing about the sentence
// beside it, so a fence whose comment claims a value the code contradicts passes all of
// them. The cases here run each flagship fence and assert the values its comments claim,
// each paired with a presence guard binding that fence's lines, so an edited fence
// reddens the transcription that went stale. Change a fence, change the transcription
// beside it.
describe('flagship fences', () => {
	const guideText = requireValue(files[CORE_GUIDE], `Missing file: ${CORE_GUIDE}`)

	it('returns the Surface fence values for an eligible and an ineligible subject', () => {
		const gates = createLogicalDefinition('gates', 'Eligibility gates', [
			createRule(
				'licensed',
				[createAtom('licensed', 'equals', false)],
				createAtom('blocked', 'equals', true),
			),
		])

		const qualification = createQualificationDefinition(
			'standard-qualification',
			'Standard qualification',
			[gates],
			{
				rulings: [
					createRuling('license', 'gates', 'licensed', 'restriction', {
						message: 'A license is required',
					}),
				],
			},
		)

		const base = buildLineDefinition(
			'base',
			'Base premium',
			createQuantitativeDefinition('base-rate', 'Base rate', [
				createFactorGroup('amount', 'sum', [createStaticFactor('minimum', 100)]),
			]),
		)

		const rating = buildRatingDefinition('standard-rating', 'Standard rating', [base])
		const definition = buildProgramDefinition('standard', 'Standard program', qualification, rating)
		const program = createProgram(definition)

		try {
			const eligible = program.execute({ id: 'risk-1', licensed: true })
			expect(eligible.status).toBe('eligible')
			expect(eligible.rating?.total).toBe(100)

			const ineligible = program.execute({ id: 'risk-2', licensed: false })
			expect(ineligible.status).toBe('ineligible')
			expect(ineligible.rating).toBeUndefined()

			// The batch fence continues from the same `program`, so its transcription runs here
			// against the program the Surface fence built rather than a second one.
			const result = program.execute([
				{ id: 'a', licensed: true, amount: 10 },
				{ id: 'b', licensed: false, amount: 20 },
			])

			expect(result.count).toBe(2)
			expect(result.subjects[0]?.status).toBe('eligible')
			expect(result.subjects[1]?.status).toBe('ineligible')
			expect(result.tallies.eligible.count).toBe(1)
			expect(result.tallies.ineligible.count).toBe(1)
		} finally {
			program.destroy()
		}
	})

	it('carries the Surface fence lines the transcription copies', () => {
		expect(guideText).toContain(
			"const gates = createLogicalDefinition('gates', 'Eligibility gates', [\n\tcreateRule(\n\t\t'licensed',\n\t\t[createAtom('licensed', 'equals', false)],\n\t\tcreateAtom('blocked', 'equals', true),\n\t),\n])\n\nconst qualification = createQualificationDefinition(\n\t'standard-qualification',\n\t'Standard qualification',\n\t[gates],\n\t{\n\t\trulings: [\n\t\t\tcreateRuling('license', 'gates', 'licensed', 'restriction', {\n\t\t\t\tmessage: 'A license is required',\n\t\t\t}),\n\t\t],\n\t},\n)\n\nconst base = buildLineDefinition(\n\t'base',\n\t'Base premium',\n\tcreateQuantitativeDefinition('base-rate', 'Base rate', [\n\t\tcreateFactorGroup('amount', 'sum', [createStaticFactor('minimum', 100)]),\n\t]),\n)\n\nconst rating = buildRatingDefinition('standard-rating', 'Standard rating', [base])\nconst definition = buildProgramDefinition('standard', 'Standard program', qualification, rating)\nconst program = createProgram(definition)\n\nconst eligible = program.execute({ id: 'risk-1', licensed: true })\neligible.status // 'eligible'\neligible.rating?.total // 100\n\nconst ineligible = program.execute({ id: 'risk-2', licensed: false })\nineligible.status // 'ineligible'\nineligible.rating // undefined — the rater was not called\n\nprogram.destroy()",
		)
	})

	it('carries the batch fence lines the transcription copies', () => {
		expect(guideText).toContain(
			"const result = program.execute([\n\t{ id: 'a', licensed: true, amount: 10 },\n\t{ id: 'b', licensed: false, amount: 20 },\n])\n\nresult.count // 2\nresult.subjects[0]?.status // 'eligible'\nresult.subjects[1]?.status // 'ineligible'\nresult.tallies.eligible.count // 1\nresult.tallies.ineligible.count // 1",
		)
	})
})
