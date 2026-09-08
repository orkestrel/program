// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The constants that follow are this
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
	findDrift,
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
/** The one guide this package sources, whose tagline the README pitch equals. */
const GUIDE_SPEC = 'guides/program.md'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ '@orkestrel/program': 'src/core' })
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the assertion that follows it fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

/** Root-level files these checks read. `readInventory` walks directories only. */
const ROOT_FILES = Object.freeze(['AGENTS.md', 'README.md'])

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
const own = requireValue(
	manifest.find((entry) => entry.spec === GUIDE_SPEC),
	`Missing manifest row: ${GUIDE_SPEC}`,
)

it('manifest lists at least one guide', () => {
	expect(manifest.length).toBeGreaterThan(0)
})

// The example half of the equality case is silent over an empty population: with no
// title on both sides `findDrift` compares no pair and the case passes on the summaries
// alone. This pins the population this repository's own guide contributes, so removing
// every `@example` title reddens the suite instead of quietly retiring half the gate.
// The failure names both title sets, because a pin reporting only its own emptiness
// leaves the reader to work out which side dropped the title.
it('pairs at least one example title across the guide and the source', () => {
	const guide = createGuide(requireValue(files[GUIDE_SPEC], `Missing file: ${GUIDE_SPEC}`))
	const source = createSource({ files, module: own.source })
	const declared = source
		.examples()
		.map((example) => example.title)
		.filter((title) => title !== undefined)
	const titled = new Set(declared)
	const headings: string[] = []
	const paired: string[] = []
	for (const fence of guide.fences()) {
		if (fence.title === undefined) continue
		headings.push(fence.title)
		if (titled.has(fence.title)) paired.push(fence.title)
	}
	const unpaired =
		paired.length > 0
			? []
			: [
					`${GUIDE_SPEC} pairs: guide ${JSON.stringify(headings)} source ${JSON.stringify(declared)}`,
				]
	expect(unpaired).toEqual([])
})

// The README's pitch and the guide's tagline are one text, each read as the blockquote
// under its file's H1. `README.md` is outside the concept index, so the reader is
// applied to it directly rather than through a manifest row. Each side is guarded
// against `undefined` first, so a file that lost its blockquote reports that rather
// than reporting two absences as agreement.
it('opens the README with the guide tagline', () => {
	const pitch = createGuide(requireValue(files['README.md'], 'Missing file: README.md')).tagline()
	const tagline = createGuide(
		requireValue(files[GUIDE_SPEC], `Missing file: ${GUIDE_SPEC}`),
	).tagline()

	expect(pitch).not.toBeUndefined()
	expect(tagline).not.toBeUndefined()
	expect(pitch).toBe(tagline)
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
			const members = source.methods(group.interface).map((method) => method.name)
			const documented = group.methods.map((method) => method.name)
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface}`, () => {
				it('documents at least one method', () => {
					expect(group.methods.length).toBeGreaterThan(0)
				})
				it('documents every interface method', () => {
					expect(findMissing(members, documented)).toEqual([])
				})
				it('documents no phantom method', () => {
					expect(findMissing(documented, members)).toEqual([])
				})
				it(`${entity} exposes no undocumented method`, () => {
					const extra =
						entity === group.interface
							? []
							: findMissing(
									source.methods(entity).map((method) => method.name),
									documented,
								)
					expect(extra).toEqual([])
				})
			})
		}

		// The equality gate: a `Summary` cell against its export's description paragraph, a
		// titled fence against the `@example` of that title. `findDrift` owns the comparison
		// and names both sides; converge the two sides with `npm run docs`, never by
		// weakening this assertion. `findDrift` pairs an example only where a title is
		// present on both sides, so an untitled `@example` block is outside this case. Each
		// collected line is the spec, the key, and each side's text or `absent` — the same
		// worklist `npm run docs` prints, so a failure here is read the way that command's
		// output is.
		it('keeps every compared summary and example equal to its source', () => {
			const disagreeing: string[] = []
			for (const drift of findDrift(guide, source)) {
				const left = drift.guide === undefined ? 'absent' : JSON.stringify(drift.guide)
				const right = drift.source === undefined ? 'absent' : JSON.stringify(drift.source)
				disagreeing.push(`${entry.spec} ${drift.key}: guide ${left} source ${right}`)
			}
			expect(disagreeing).toEqual([])
		})

		it('documents an example for every Surface function', () => {
			const fences = guide
				.fences()
				.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
				.map((fence) => fence.code)
			const names = guide
				.surface()
				.filter((symbol) => symbol.keyword === 'function')
				.map((symbol) => symbol.name)
			expect(
				findUnexampled(
					names,
					fences,
					source.examples().map((example) => example.name),
				),
			).toEqual([])
		})

		for (const group of guide.methods()) {
			const entity = group.interface.replace(/Interface$/, '')
			const documented = group.methods.map((method) => method.name)
			const examples =
				entity === group.interface
					? source.examples(group.interface).map((example) => example.name)
					: source
							.examples(group.interface)
							.map((example) => example.name)
							.concat(source.examples(entity).map((example) => example.name))
			describe(`${group.interface} examples`, () => {
				it('documents an example for every method', () => {
					const fences = guide
						.fences()
						.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
						.map((fence) => fence.code)
					expect(findUnexampled(documented, fences, examples)).toEqual([])
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
	const guideText = requireValue(files[GUIDE_SPEC], `Missing file: ${GUIDE_SPEC}`)

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
