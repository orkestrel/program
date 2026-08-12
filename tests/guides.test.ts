import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
	createGuide,
	createSource,
	findMissing,
	isExternalLink,
	missingSymbols,
	parseManifest,
	resolveLink,
} from '@orkestrel/guide'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

function walkTsFiles(directory: string, output: Record<string, string>) {
	for (const entry of readdirSync(directory)) {
		const absolute = join(directory, entry)
		const relativePath = relative(ROOT, absolute).replaceAll('\\', '/')
		if (statSync(absolute).isDirectory()) {
			walkTsFiles(absolute, output)
			continue
		}
		if (!relativePath.endsWith('.ts')) continue
		output[relativePath] = readFileSync(absolute, 'utf8')
	}
}

function walkMarkdownFiles(directory: string, output: Record<string, string>) {
	for (const entry of readdirSync(directory)) {
		const absolute = join(directory, entry)
		const relativePath = relative(ROOT, absolute).replaceAll('\\', '/')
		if (statSync(absolute).isDirectory()) {
			walkMarkdownFiles(absolute, output)
			continue
		}
		if (!relativePath.endsWith('.md')) continue
		output[relativePath] = readFileSync(absolute, 'utf8')
	}
}

const files: Record<string, string> = {}
walkTsFiles(join(ROOT, 'src/core'), files)
walkMarkdownFiles(join(ROOT, 'guides'), files)

const readText = (relativePath: string) =>
	files[relativePath] ?? readFileSync(new URL(relativePath, ROOT), 'utf8')

const manifest = parseManifest(readText('guides/README.md'), 'guides')

describe('guides parity', () => {
	it('parses a non-empty manifest', () => {
		expect(manifest.length).toBeGreaterThan(0)
	})

	for (const entry of manifest) {
		describe(`${entry.concept}`, () => {
			const guide = createGuide(readText(entry.spec))
			const source = createSource({ files, module: entry.source })

			it('documents every source export', () => {
				expect(missingSymbols(source.exports(), guide.surface())).toEqual([])
			})

			it('documents only real exports', () => {
				expect(missingSymbols(guide.surface(), source.exports())).toEqual([])
			})

			it('documents every public method on implementing classes', () => {
				for (const group of guide.methods()) {
					const documented = [...group.methods]
					const actual = [...source.methods(group.interface)]
					expect(findMissing(documented, actual)).toEqual([])
					expect(findMissing(actual, documented)).toEqual([])
				}
			})

			it('resolves internal links', () => {
				for (const href of guide.links()) {
					if (isExternalLink(href)) continue
					const resolved = resolveLink(entry.spec, href)
					expect(source.exists(resolved)).toBe(true)
				}
			})

			it('resolves tests links', () => {
				for (const href of guide.tests()) {
					const resolved = resolveLink(entry.spec, href)
					expect(source.exists(resolved)).toBe(true)
				}
			})

			it('extracts non-vacuous surface and methods', () => {
				expect(guide.surface().length).toBeGreaterThan(0)
				for (const group of guide.methods()) {
					expect(group.methods.length).toBeGreaterThan(0)
				}
			})
		})
	}
})
