# @orkestrel/program

A **program composition layer** over
[`@orkestrel/qualifier`](https://github.com/orkestrel/qualifier) and
[`@orkestrel/rater`](https://github.com/orkestrel/rater): a pure,
JSON-serializable `ProgramDefinition` composes one qualification with an optional
rating, plus optional notices, authority, and batch aggregate policy. `Program` executes
the workflow in one direction — qualify the subject, stop on terminal
qualification, select eligible rating lines, rate only those lines, derive status,
then evaluate optional authority — returning a nested `ProgramResult` (or
`AggregateResult` for batch `execute`). Globally ineligible or referred subjects
never reach the rater. Execution never mutates its inputs — every result is a
fresh object. Environment-agnostic — no I/O, no browser or server assumptions.
Part of the `@orkestrel` line.

## Install

```sh
npm install @orkestrel/program
```

## Requirements

- Node.js >= 24
- ESM (`import`) and CommonJS (`require`) via the `exports` field

## Usage

```ts
import { createProgram, programDefinition } from '@orkestrel/program'
import { qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'
import { lineDefinition, ratingDefinition } from '@orkestrel/rater'
import {
	atom,
	factorGroup,
	logicalDefinition,
	quantitativeDefinition,
	rule,
	staticFactor,
} from '@orkestrel/reason'

const gates = logicalDefinition('gates', 'Eligibility gates', [
	rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
])

const qualification = qualificationDefinition(
	'standard-qualification',
	'Standard qualification',
	[gates],
	{
		rulings: [
			rulingDefinition('license', 'gates', 'licensed', 'restriction', {
				message: 'A license is required',
			}),
		],
	},
)

const base = lineDefinition(
	'base',
	'Base premium',
	quantitativeDefinition('base-rate', 'Base rate', [
		factorGroup('amount', 'sum', [staticFactor('minimum', 100)]),
	]),
)

const rating = ratingDefinition('standard-rating', 'Standard rating', [base])

const definition = programDefinition('standard', 'Standard program', qualification, rating)

const program = createProgram(definition)

const eligible = program.execute({
	id: 'risk-1',
	licensed: true,
})

eligible.eligibility // 'eligible'
eligible.status // 'eligible'
eligible.rating?.total // 100

const ineligible = program.execute({
	id: 'risk-2',
	licensed: false,
})

ineligible.eligibility // 'ineligible'
ineligible.status // 'ineligible'
ineligible.rating // undefined — the rater was not called

program.emitter.on('execute', (result) => result.success)

program.destroy()
```

`execute` accepts one subject or a subject array — the array overload performs
one aggregate-aware batch and returns an `AggregateResult`. Every single-subject
`execute` call fires through `program.emitter` (`qualify`, `rate`, `determine`,
`decide`, `execute`).

## Guide

For the full surface — `Program`, `ProgramManager`, `ProgramResult`,
`AggregateResult`, validators, factories, errors, and options — see
[`guides/src/program.md`](guides/src/program.md).

## Package

Published as a single typed entry point per the `exports` field in
`package.json`.

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).
