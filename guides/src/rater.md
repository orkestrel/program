# Rater

> A typed quantitative rating layer over `@orkestrel/reason`'s shared engine: authored
> **lines** — each a plain reason `QuantitativeDefinition` joined to display metadata —
> are rated against a **subject** (a plain data record) to produce a `LineResult` per
> line (an `amount` plus its `Worksheet` audit trail) and one `RatingResult` (every
> line's outcome plus a derived `total`). The caller decides WHICH lines to rate for a
> subject — `Rater` only rates the lines it is given and reports what each one resolved
> to; it performs NO evaluation arithmetic of its own. Rating never mutates its inputs:
> every result is a fresh object. `Rater` either receives an injected `ReasonInterface`
> (never destroyed by `Rater`) or builds and OWNS its own quantitative-only engine
> (`bail: false`), destroyed in `destroy()`. An injected engine MUST be able to dispatch
> a quantitative definition — one it cannot dispatch surfaces the engine's own error,
> never wrapped by this package. Every `rate` call fires once through `Rater`'s typed
> `emitter` (AGENTS §13). Source: [`src/core`](../../src/core). Surfaced through the
> `@src/core` barrel.

## Surface

Create a rater, rate one subject against a list of lines (or a full rating
definition), read the derived total:

```ts
import { createRater, lineDefinition } from '@orkestrel/rater'
import { factorGroup, quantitativeDefinition, staticFactor } from '@orkestrel/reason'

const rater = createRater()

const base = lineDefinition(
	'base',
	'Base Amount',
	quantitativeDefinition('base', 'Base', [
		factorGroup('amount', 'sum', [staticFactor('flat', 100)]),
	]),
)

const result = rater.rate([base], { id: 'subject-1' })
result.lines[0]?.amount // 100
result.total // 100

rater.emitter.on('rate', (subject, rated) => rated.success)

rater.destroy()
```

`rate` dispatches by input shape — the array-of-lines overload is declared FIRST
(AGENTS §9.2) so a plain line list resolves to that form; a `RatingDefinition` resolves
the same way through its own `lines`. Both overloads rate exactly ONE subject — there
is no batch overload, and the subject must be a plain record or `rate` throws
`RaterError` `'MISMATCH'`; an input that is neither an array of lines nor a
`RatingDefinition` throws `RaterError` `'DEFINITION'`. A line that fails to resolve (a
missing lookup entry, a failed required factor) is a rating FAILURE reported on its
own `LineResult` (`success: false`, no `amount`, a populated `worksheet.errors`) — the
caller decides what to do with a failed line; `Rater` only reports exactly what each
line resolved to. `total` is derived from every line's `amount` by a `TotalHandler`
(default `sumAmounts`, overridable through `RaterOptions.total`) and counts only the
lines that succeeded.

### Types

| Type               | Kind      | Shape                                                                                                                                                           |
| ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Stage`            | type      | `'factor' \| 'group' \| 'total'` — a worksheet derivation step stage.                                                                                           |
| `RaterErrorCode`   | type      | `'DEFINITION' \| 'MISMATCH' \| 'DESTROYED'` — a coded `RaterError` programmer-error code.                                                                       |
| `TotalHandler`     | type      | `(lines: readonly LineResult[]) => number \| undefined` — a pure total port over resolved lines.                                                                |
| `LineDefinition`   | interface | `{ id, name, description?, rate, metadata? }` — one rateable line: a quantitative definition joined to display metadata.                                        |
| `RatingDefinition` | interface | `{ id, name, description?, lines, metadata? }` — a pure authored rating: a named, ordered set of lines.                                                         |
| `Evidence`         | interface | `{ field?, label?, comparison?, expected?, actual?, met? }` — a checked-evidence row rendered into a display-neutral sentence.                                  |
| `WorksheetFactor`  | interface | `{ id, name?, description?, applied, value?, evidence }` — a resolved quantitative factor joined to its authored metadata.                                      |
| `WorksheetGroup`   | interface | `{ id, name?, description?, applied, value, factors }` — a resolved quantitative group joined to its authored metadata.                                         |
| `Step`             | interface | `{ stage, id?, name?, value, expression? }` — a display-neutral worksheet derivation step.                                                                      |
| `Worksheet`        | interface | `{ id, name, aggregation, precision?, value, groups, steps, trace, errors, success }` — a quantitative definition joined to its result, the rating audit trail. |
| `LineResult`       | interface | `{ id, name, amount?, worksheet, success }` — one line's rating outcome; `amount` is present ONLY when `success` is `true`.                                     |
| `RatingResult`     | interface | `{ lines, total?, success }` — a rated outcome across every line of one `rate` call; `success` is `true` only when every line succeeded.                        |
| `RaterEventMap`    | type      | `Rater`'s push observation surface (AGENTS §13) — `rate(subject, result)`.                                                                                      |
| `RaterOptions`     | interface | `{ on?, error?, engine?, total?, labels? }` — input to `createRater`.                                                                                           |
| `RaterInterface`   | interface | The rating orchestrator over the shared engine — `emitter` + `rate` (array overload declared FIRST) + `destroy`.                                                |

### Errors

| API            | Kind     | Summary                                                                                    |
| -------------- | -------- | ------------------------------------------------------------------------------------------ |
| `RaterError`   | class    | Carries a `RaterErrorCode` (`DEFINITION` / `MISMATCH` / `DESTROYED`) + optional `context`. |
| `isRaterError` | function | Narrow a caught value to a `RaterError`.                                                   |

```ts
import { isRaterError, RaterError } from '@orkestrel/rater'

try {
	throw new RaterError('DESTROYED', 'Rater has been destroyed')
} catch (error) {
	if (isRaterError(error)) error.code // 'DESTROYED'
}
```

### Validators

Total guards (AGENTS §14) composed from `@orkestrel/contract` combinators — adversarial
input (junk, cycles, hostile prototypes) returns `false`, never throws. Record guards
are **exact**: an extra key fails.

| API                  | Kind     | Narrows to          |
| -------------------- | -------- | ------------------- |
| `isStage`            | const    | `Stage`.            |
| `isLineDefinition`   | function | `LineDefinition`.   |
| `isRatingDefinition` | function | `RatingDefinition`. |

```ts
import { isLineDefinition, isRatingDefinition, isStage } from '@orkestrel/rater'
import { quantitativeDefinition } from '@orkestrel/reason'

isStage('group') // true
isLineDefinition({
	id: 'base',
	name: 'Base Amount',
	rate: quantitativeDefinition('base', 'Base', []),
}) // true
isRatingDefinition({ id: 'r1', name: 'Rating', lines: [] }) // true
```

### Helpers

Pure, exported utility functions (AGENTS §4.3) — the evidence construction and
worksheet-joining behind `Rater`'s `rate` projection.

| API                | Kind     | Summary                                                                                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------- |
| `evidenceCheck`    | function | Build an `Evidence` row from an evaluated `Check`.                                                        |
| `checkEvidence`    | function | Build evidence rows from a quantitative factor's authored checks and evaluated check results.             |
| `worksheetFactor`  | function | Join one authored quantitative factor to its evaluated `FactorResult`.                                    |
| `worksheetGroup`   | function | Join one authored quantitative group to its evaluated `GroupResult`.                                      |
| `worksheetStep`    | function | Build one display-neutral `Step` row.                                                                     |
| `worksheetSteps`   | function | Build the ordered `Step` rows for a resolved `Worksheet`.                                                 |
| `resultsWorksheet` | function | Join a `QuantitativeDefinition` and its `QuantitativeResult` into a `Worksheet` — the rating audit trail. |
| `ratedLine`        | function | Build a rated `LineResult` from a line's evaluated `QuantitativeResult`.                                  |
| `sumAmounts`       | function | Sum defined line amounts.                                                                                 |

Evidence construction — a `Check` (and its evaluated result) rendered into a
display-neutral `Evidence` row; `labels` (keyed by dot-joined field) override the resolved
`label`:

```ts
import { checkEvidence, evidenceCheck } from '@orkestrel/rater'
import { check } from '@orkestrel/reason'

const evaluated = check('age', 'above', 18)
evidenceCheck(evaluated, 25, true) // { field: 'age', comparison: 'above', expected: 18, actual: 25, met: true }
evidenceCheck(evaluated, 25, true, { age: 'Age' }) // labels override → adds { label: 'Age' }
checkEvidence([evaluated], [{ field: 'age', met: true, actual: 25 }])
```

Worksheet joining and line assembly — one authored quantitative definition and its
evaluated result, walked into the display-neutral `Worksheet` audit trail and then a
rated `LineResult`:

```ts
import {
	lineDefinition,
	ratedLine,
	resultsWorksheet,
	sumAmounts,
	worksheetFactor,
	worksheetGroup,
	worksheetStep,
	worksheetSteps,
} from '@orkestrel/rater'
import {
	createQuantitativeReasoner,
	createReason,
	factorGroup,
	fieldFactor,
	quantitativeDefinition,
} from '@orkestrel/reason'

const definition = quantitativeDefinition('risk', 'Risk', [
	factorGroup('drivers', 'sum', [fieldFactor('age', 'age')]),
])
const engine = createReason({ reasoners: [createQuantitativeReasoner()] })
const result = engine.reason({ age: 25 }, definition)

if (result.reasoning === 'quantitative') {
	const group = definition.groups[0]
	const groupResult = result.groups[0]
	if (group !== undefined && groupResult !== undefined) {
		const factor = group.factors[0]
		if (factor !== undefined) worksheetFactor(factor, groupResult.factors) // one factor joined to its result
		worksheetGroup(group, result.groups) // one group joined to its result
	}
	worksheetStep('total', definition.id, definition.name, result.value, `sum = ${result.value}`)
	worksheetSteps(definition, result, []) // the full ordered step list: factors, groups, then the total
	resultsWorksheet(definition, result) // the whole worksheet — groups, steps, trace, errors, success

	const line = lineDefinition('risk', 'Risk', definition)
	ratedLine(line, result) // the line's rated LineResult — amount present only when success
}

sumAmounts([]) // undefined — no line carries an amount
```

### Factories

| API                | Kind     | Builds…                                                                             |
| ------------------ | -------- | ----------------------------------------------------------------------------------- |
| `createRater`      | function | A `RaterInterface` — the rating orchestrator, seeded from `RaterOptions`.           |
| `lineDefinition`   | function | A `LineDefinition` from id / name / rate (`overrides` merged over the defaults).    |
| `ratingDefinition` | function | A `RatingDefinition` from id / name / lines (`overrides` merged over the defaults). |

Every factory returns a fresh object and omits absent optional keys entirely.

```ts
import { createRater, lineDefinition, ratingDefinition } from '@orkestrel/rater'
import { quantitativeDefinition } from '@orkestrel/reason'

const rater = createRater()
rater.destroy()

const base = lineDefinition('base', 'Base Amount', quantitativeDefinition('base', 'Base', []))
ratingDefinition('r1', 'Rating', [base])
```

### Entities

| API     | Kind  | Summary                                                                                                                                       |
| ------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Rater` | class | The rating orchestrator — owns (or receives) the shared quantitative reasoning engine and projects results into the rating domain vocabulary. |

## Methods

The public methods of `RaterInterface` — one table, keyed by its backticked name,
every call-signature member listed (the `readonly` data member `emitter` stays off the
method table). `Rater` exposes exactly its interface's methods, so this doubles as the
per-instance method surface (AGENTS §22).

#### `RaterInterface`

The array-of-lines overload of `rate` is declared FIRST (AGENTS §9.2) so a plain line
list resolves to that form; both overloads rate exactly ONE subject. `destroy()` is
idempotent — it destroys an OWNED engine (never an injected one), then the emitter LAST
(AGENTS §13). Afterwards every other method throws `RaterError` `'DESTROYED'`.

| Method    | Returns        | Behavior                                                                                        |
| --------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `rate`    | `RatingResult` | Rate an array of lines — or a `RatingDefinition` — against ONE subject, over the shared engine. |
| `destroy` | `void`         | Idempotent teardown — an OWNED engine, then the emitter LAST.                                   |

```ts
import { createRater, lineDefinition } from '@orkestrel/rater'
import { quantitativeDefinition } from '@orkestrel/reason'

const rater = createRater()
const base = lineDefinition('base', 'Base Amount', quantitativeDefinition('base', 'Base', []))

rater.rate([base], { id: 'subject-1' }) // the array-of-lines overload
rater.rate({ id: 'r1', name: 'Rating', lines: [base] }, { id: 'subject-1' }) // the RatingDefinition overload

rater.destroy()
```
