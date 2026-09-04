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
> `emitter`. Source: [`src/core`](../src/core). Surfaced through the `@src/core` barrel.

## Surface

Create a rater, rate one subject against a list of lines (or a full rating
definition), read the derived total:

```ts
import { buildLineDefinition, createRater } from '@orkestrel/rater'
import {
	createFactorGroup,
	createQuantitativeDefinition,
	createStaticFactor,
} from '@orkestrel/reason'

const rater = createRater()

const base = buildLineDefinition(
	'base',
	'Base Amount',
	createQuantitativeDefinition('base', 'Base', [
		createFactorGroup('amount', 'sum', [createStaticFactor('flat', 100)]),
	]),
)

const result = rater.rate([base], { id: 'subject-1' })
result.lines[0]?.amount // 100
result.total // 100

rater.emitter.on('rate', (subject, rated) => rated.success)

rater.destroy()
```

`rate` dispatches by input shape — the array-of-lines overload is declared FIRST so a
plain line list resolves to that form; a `RatingDefinition` resolves the same way
through its own `lines`. Both overloads rate exactly ONE subject — there is no batch
overload, and the subject must be a plain record or `rate` throws `RaterError`
`'MISMATCH'`; an input that is neither an array of lines nor a `RatingDefinition`
throws `RaterError` `'DEFINITION'`. A line that fails to resolve (a missing lookup
entry, a failed required factor) is a rating FAILURE reported on its own `LineResult`
(`worksheet.success: false`, no `amount`, a populated `worksheet.errors`) — the caller decides
what to do with a failed line; `Rater` only reports exactly what each line resolved
to. `total` is derived from every line's `amount` by a `TotalHandler` (default
`sumAmounts`, overridable through `RaterOptions.total`) and counts only the lines
that succeeded.

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
| `LineResult`       | interface | `{ id, name, amount?, worksheet }` — one line's rating outcome; `amount` is present ONLY when `worksheet.success` is `true`.                                    |
| `RatingResult`     | interface | `{ lines, total?, success }` — a rated outcome across every line of one `rate` call; `success` is `true` only when every line's `worksheet.success` is `true`.  |
| `RaterEventMap`    | type      | `Rater`'s push observation surface — `rate(subject, result)`.                                                                                                   |
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

Total guards composed from `@orkestrel/contract` combinators — adversarial input
(junk, cycles, hostile prototypes) returns `false`, never throws. The guards take their
posture from who produces the value. Authored definitions supplied to this package use
exact `recordOf` guards because this package owns that input shape; extra keys fail.
Results returned by a borrowed `RaterInterface` use open `objectOf` guards because
another valid implementation may return class instances, inherited members,
or extra members. `isRatingResult` is the borrowed-engine boundary: it and its nested
result guards reject arrays and check every published typed member without narrowing
plain numbers, strings, or unknown values.

| API                  | Kind     | Checks                                                                                                                                                                      | Leaves unchecked and why                                                                                                         |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `isStage`            | const    | One of the `Stage` literals — `'factor'`, `'group'`, or `'total'`.                                                                                                          | Nothing; a scalar union has no open/exact axis.                                                                                  |
| `isLineDefinition`   | function | Every `LineDefinition` member, including its quantitative definition.                                                                                                       | Nothing; this package owns the authored input record, so extra keys fail.                                                        |
| `isRatingDefinition` | function | Every `RatingDefinition` member and nested line definition.                                                                                                                 | Nothing; this package owns the authored input record, so extra keys fail.                                                        |
| `isEvidence`         | function | Optional `field` as `FieldPath`, `label` as string, `comparison` as `Comparison`, and `met` as boolean when defined.                                                        | `expected`, `actual`, and unknown members; their published type is `unknown`, and borrowed results must not be narrowed.         |
| `isWorksheetFactor`  | function | `id`, optional authored text, `applied`, optional plain-number `value`, and each `Evidence` entry.                                                                          | Unknown members; borrowed result implementations may add them.                                                                   |
| `isWorksheetGroup`   | function | `id`, optional authored text, `applied`, plain-number `value`, and each `WorksheetFactor` entry.                                                                            | Unknown members; borrowed result implementations may add them.                                                                   |
| `isStep`             | function | `stage` through `isStage`, optional `id` / `name` / `expression`, and plain-number `value`.                                                                                 | Unknown members; borrowed result implementations may add them.                                                                   |
| `isWorksheet`        | function | Identity, `aggregation` through reason's `isAggregation`, optional plain-number `precision`, plain-number `value`, nested groups and steps, trace, `errors`, and `success`. | Unknown members; borrowed result implementations may add them.                                                                   |
| `isLineResult`       | function | Identity, optional plain-number `amount`, and the nested `Worksheet` that carries the line's outcome.                                                                       | Unknown members and the relationship between `amount` and `worksheet.success`; the published interface types them independently. |
| `isRatingResult`     | function | Every nested `LineResult`, optional plain-number `total`, and boolean `success`.                                                                                            | Unknown members and relationships among totals, lines, and success; the borrowed interface publishes only their member types.    |

```ts
import { isLineDefinition, isRatingDefinition, isStage } from '@orkestrel/rater'
import { createQuantitativeDefinition } from '@orkestrel/reason'

isStage('group') // true
isLineDefinition({
	id: 'base',
	name: 'Base Amount',
	rate: createQuantitativeDefinition('base', 'Base', []),
}) // true
isRatingDefinition({ id: 'r1', name: 'Rating', lines: [] }) // true
```

### Helpers

Pure, exported utility functions — the definition builders, the evidence construction,
and the worksheet-joining behind `Rater`'s `rate` projection.

| API                     | Kind     | Summary                                                                                                   |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `buildLineDefinition`   | function | Build a `LineDefinition` from id / name / rate (`overrides` merged over the defaults).                    |
| `buildRatingDefinition` | function | Build a `RatingDefinition` from id / name / lines (`overrides` merged over the defaults).                 |
| `buildEvidence`         | function | Build an `Evidence` row from an evaluated `Check`.                                                        |
| `buildEvidenceRows`     | function | Build one evidence row per authored check of a quantitative factor, joined to its result.                 |
| `buildWorksheetFactor`  | function | Join one authored quantitative factor to its evaluated `FactorResult`.                                    |
| `buildWorksheetGroup`   | function | Join one authored quantitative group to its evaluated `GroupResult`.                                      |
| `buildWorksheetStep`    | function | Build one display-neutral `Step` row.                                                                     |
| `buildWorksheetSteps`   | function | Build the ordered `Step` rows for a resolved `Worksheet`.                                                 |
| `buildWorksheet`        | function | Join a `QuantitativeDefinition` and its `QuantitativeResult` into a `Worksheet` — the rating audit trail. |
| `buildLineResult`       | function | Build a rated `LineResult` from a line's evaluated `QuantitativeResult`.                                  |
| `sumAmounts`            | function | Sum defined line amounts.                                                                                 |

Definition building — `id`, `name`, and the required member, with `overrides` merged over
them; each returns a fresh object and omits absent optional keys entirely:

```ts
import { buildLineDefinition, buildRatingDefinition } from '@orkestrel/rater'
import { createQuantitativeDefinition } from '@orkestrel/reason'

const base = buildLineDefinition(
	'base',
	'Base Amount',
	createQuantitativeDefinition('base', 'Base', []),
)
buildRatingDefinition('r1', 'Rating', [base])
buildRatingDefinition('r1', 'Rating', [base], { description: 'A rating' }) // overrides merged over the defaults
```

Evidence construction — a `Check` (and its evaluated result) rendered into a
display-neutral `Evidence` row; `labels` (keyed by dot-joined field) override the resolved
`label`:

```ts
import { buildEvidence, buildEvidenceRows } from '@orkestrel/rater'
import { createCheck } from '@orkestrel/reason'

const evaluated = createCheck('age', 'above', 18)
buildEvidence(evaluated, 25, true) // { field: 'age', comparison: 'above', expected: 18, actual: 25, met: true }
buildEvidence(evaluated, 25, true, { age: 'Age' }) // labels override → adds { label: 'Age' }
buildEvidenceRows([evaluated], [{ field: 'age', met: true, actual: 25 }])
```

Worksheet joining and line assembly — one authored quantitative definition and its
evaluated result, walked into the display-neutral `Worksheet` audit trail and then a
rated `LineResult`:

```ts
import {
	buildLineDefinition,
	buildLineResult,
	buildWorksheet,
	buildWorksheetFactor,
	buildWorksheetGroup,
	buildWorksheetStep,
	buildWorksheetSteps,
	sumAmounts,
} from '@orkestrel/rater'
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
	createQuantitativeReasoner,
	createReason,
} from '@orkestrel/reason'

const definition = createQuantitativeDefinition('risk', 'Risk', [
	createFactorGroup('drivers', 'sum', [createFieldFactor('age', 'age')]),
])
const engine = createReason({ reasoners: [createQuantitativeReasoner()] })
const result = engine.reason({ age: 25 }, definition)

if (result.reasoning === 'quantitative') {
	const group = definition.groups[0]
	const groupResult = result.groups[0]
	if (group !== undefined && groupResult !== undefined) {
		const factor = group.factors[0]
		if (factor !== undefined) buildWorksheetFactor(factor, groupResult.factors) // one factor joined to its result
		buildWorksheetGroup(group, result.groups) // one group joined to its result
	}
	buildWorksheetStep('total', definition.id, definition.name, result.value, `sum = ${result.value}`)
	buildWorksheetSteps(
		definition,
		result,
		definition.groups.map((entry) => buildWorksheetGroup(entry, result.groups)),
	) // the full ordered step list: factors, groups, then the total
	buildWorksheet(definition, result) // the whole worksheet — groups, steps, trace, errors, success

	const line = buildLineDefinition('risk', 'Risk', definition)
	buildLineResult(line, result) // the line's rated LineResult — amount present only on a successful worksheet
}

sumAmounts([]) // undefined — no line carries an amount
```

### Factories

| API           | Kind     | Builds…                                                                   |
| ------------- | -------- | ------------------------------------------------------------------------- |
| `createRater` | function | A `RaterInterface` — the rating orchestrator, seeded from `RaterOptions`. |

`createRater` returns a live entity that owns an engine unless one is injected, so every
rater is destroyed when its work is done.

```ts
import { createRater } from '@orkestrel/rater'

const rater = createRater()
rater.destroy()
```

### Entities

| API     | Kind  | Summary                                                                                                                                       |
| ------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Rater` | class | The rating orchestrator — owns (or receives) the shared quantitative reasoning engine and projects results into the rating domain vocabulary. |

## Methods

The public methods of `RaterInterface` — one table, keyed by its backticked name,
every call-signature member listed (the `readonly` data member `emitter` stays off the
method table). `Rater` exposes exactly its interface's methods, so this doubles as the
per-instance method surface.

#### `RaterInterface`

The array-of-lines overload of `rate` is declared FIRST so a plain line list resolves
to that form; both overloads rate exactly ONE subject. `destroy()` is idempotent — it
destroys an OWNED engine (never an injected one), then the emitter LAST. Afterwards
every other method throws `RaterError` `'DESTROYED'`.

| Method    | Returns        | Behavior                                                                                        |
| --------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `rate`    | `RatingResult` | Rate an array of lines — or a `RatingDefinition` — against ONE subject, over the shared engine. |
| `destroy` | `void`         | Idempotent teardown — an OWNED engine, then the emitter LAST.                                   |

```ts
import { buildLineDefinition, createRater } from '@orkestrel/rater'
import { createQuantitativeDefinition } from '@orkestrel/reason'

const rater = createRater()
const base = buildLineDefinition(
	'base',
	'Base Amount',
	createQuantitativeDefinition('base', 'Base', []),
)

rater.rate([base], { id: 'subject-1' }) // the array-of-lines overload
rater.rate({ id: 'r1', name: 'Rating', lines: [base] }, { id: 'subject-1' }) // the RatingDefinition overload

rater.destroy()
```
