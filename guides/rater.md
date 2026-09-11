# Rater

> A typed quantitative rating layer over `@orkestrel/reason`'s shared engine: authored
> lines, each a plain reason `QuantitativeDefinition` joined to display metadata, rated
> against one subject to produce a `LineResult` per line — an `amount` and its
> `Worksheet` audit trail — and one `RatingResult` carrying every line's outcome and a
> derived `total`.

A subject is a plain data record, and the caller decides which lines to rate for it:
`Rater` rates the lines it is handed, reports what each one resolved to, and performs no
evaluation arithmetic of its own. Rating never mutates its inputs, so every result is a
fresh object. A rater either receives an injected `ReasonInterface`, which it never
destroys, or builds and owns its own quantitative-only engine (`bail: false`) and
destroys that engine in `destroy()`. An injected engine must be able to dispatch a
quantitative definition: one it cannot dispatch surfaces the engine's own error, which
this package never wraps. Every `rate` call fires once through the rater's typed
`emitter`. Source: [`src/core`](../src/core). Surfaced through the `@src/core` barrel.

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

`rate` dispatches by input shape — the array-of-lines overload is declared first so a
plain line list resolves to that form; a `RatingDefinition` resolves the same way
through its own `lines`. Each overload rates exactly one subject — there is no batch
overload, and the subject must be a plain record or `rate` throws `RaterError`
`'MISMATCH'`; an input that is neither an array of lines nor a `RatingDefinition`
throws `RaterError` `'DEFINITION'`. A line that fails to resolve (a missing lookup
entry, a failed required factor) is a rating failure reported on its own `LineResult`
(`worksheet.success: false`, no `amount`, a populated `worksheet.errors`) — the caller decides
what to do with a failed line, and `Rater` reports exactly what each line resolved
to. `total` is derived from every line's `amount` by a `TotalHandler` (default
`sumAmounts`, overridable through `RaterOptions.total`). A `LineResult` carries an
`amount` only when its `worksheet.success` is `true`, and a `RatingResult`'s `success`
is `true` only when every line's `worksheet.success` is `true`.

### Types

A `Shape` cell holds an interface's data members as bare names in braces, `?` marking an
optional member and `plus` introducing its call-signature members, and a type alias's own
type literal with a union's arms escaped as `\|`.

| Type               | Kind      | Shape                                                                                 | Summary                                                                              |
| ------------------ | --------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Stage`            | type      | `'factor' \| 'group' \| 'total'`                                                      | Names a worksheet derivation step stage.                                             |
| `RaterErrorCode`   | type      | `'DEFINITION' \| 'MISMATCH' \| 'DESTROYED'`                                           | Names a coded `RaterError` programmer-error code.                                    |
| `TotalHandler`     | type      | `(lines: readonly LineResult[]) => number \| undefined`                               | Represents a pure total port over resolved lines.                                    |
| `LineDefinition`   | interface | `{ id, name, description?, rate, metadata? }`                                         | Represents one rateable line — a quantitative definition joined to display metadata. |
| `RatingDefinition` | interface | `{ id, name, description?, lines, metadata? }`                                        | Represents a pure authored rating — a named, ordered set of lines.                   |
| `Evidence`         | interface | `{ field?, label?, comparison?, expected?, actual?, met? }`                           | Represents a checked-evidence row rendered into a display-neutral sentence.          |
| `WorksheetFactor`  | interface | `{ id, name?, description?, applied, value?, evidence }`                              | Represents a resolved quantitative factor, joined to its authored metadata.          |
| `WorksheetGroup`   | interface | `{ id, name?, description?, applied, value, factors }`                                | Represents a resolved quantitative group, joined to its authored metadata.           |
| `Step`             | interface | `{ stage, id?, name?, value, expression? }`                                           | Represents a display-neutral worksheet derivation step.                              |
| `Worksheet`        | interface | `{ id, name, aggregation, precision?, value, groups, steps, trace, errors, success }` | Represents a quantitative definition joined to its result — the rating audit trail.  |
| `LineResult`       | interface | `{ id, name, amount?, worksheet }`                                                    | Represents one line's rating outcome.                                                |
| `RatingResult`     | interface | `{ lines, total?, success }`                                                          | Represents a rated outcome across every line of one `rate` call.                     |
| `RaterEventMap`    | type      | `{ rate }`                                                                            | Represents the push observation surface of a `RaterInterface`.                       |
| `RaterOptions`     | interface | `{ on?, error?, engine?, total?, labels? }`                                           | Configures `createRater` and the `Rater` constructor.                                |
| `RaterInterface`   | interface | `{ emitter } plus rate, destroy`                                                      | Represents the rating orchestrator over the shared quantitative reasoning engine.    |

`RaterInterface`'s `emitter` is a `readonly` data member and stays in this table's
`Shape` cell; the interface's call-signature members are documented under
[Methods](#methods).

### Errors

Every `RaterError` carries a `code` — `'DEFINITION'`, `'MISMATCH'`, or `'DESTROYED'` —
and an optional `context` record of structured detail beside its message.

| API            | Kind     | Summary                                                         |
| -------------- | -------- | --------------------------------------------------------------- |
| `RaterError`   | class    | Represents a coded programmer error thrown by the rating layer. |
| `isRaterError` | function | Narrows a caught value to a `RaterError`.                       |

The `isRaterError` guard narrows a caught value, so a handler reads the `code` member
off it:

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

In a guard table a `Shape` cell holds the type the guard narrows to.

| API                  | Kind     | Shape              | Summary                                                                |
| -------------------- | -------- | ------------------ | ---------------------------------------------------------------------- |
| `isStage`            | const    | `Stage`            | Determines whether a value is a `Stage` literal.                       |
| `isLineDefinition`   | function | `LineDefinition`   | Determines whether a value is an exact `LineDefinition` record.        |
| `isRatingDefinition` | function | `RatingDefinition` | Determines whether a value is an exact `RatingDefinition` record.      |
| `isEvidence`         | function | `Evidence`         | Determines whether a value is an open result-side `Evidence` object.   |
| `isWorksheetFactor`  | function | `WorksheetFactor`  | Determines whether a value is an open `WorksheetFactor` result object. |
| `isWorksheetGroup`   | function | `WorksheetGroup`   | Determines whether a value is an open `WorksheetGroup` result object.  |
| `isStep`             | function | `Step`             | Determines whether a value is an open `Step` result object.            |
| `isWorksheet`        | function | `Worksheet`        | Determines whether a value is an open `Worksheet` result object.       |
| `isLineResult`       | function | `LineResult`       | Determines whether a value is an open `LineResult` object.             |
| `isRatingResult`     | function | `RatingResult`     | Determines whether a value is an open `RatingResult` object.           |

Each guard answers `true` for a value of its own shape:

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

| API                     | Kind     | Summary                                                                                                                                                     |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildLineDefinition`   | function | Builds a fresh `LineDefinition` from a line id, a display name, and the line's quantitative rating definition, with `overrides` merged over those defaults. |
| `buildRatingDefinition` | function | Builds a fresh `RatingDefinition` from a rating id, a display name, and the rating's ordered lines, with `overrides` merged over those defaults.            |
| `buildEvidence`         | function | Builds an `Evidence` row from an evaluated `Check`.                                                                                                         |
| `buildEvidenceRows`     | function | Builds one evidence row per authored check of a quantitative factor, joined to that check's evaluated result.                                               |
| `buildWorksheetFactor`  | function | Joins one authored quantitative factor to its evaluated `FactorResult`.                                                                                     |
| `buildWorksheetGroup`   | function | Joins one authored quantitative group to its evaluated `GroupResult`.                                                                                       |
| `buildWorksheetStep`    | function | Builds one display-neutral `Step` row.                                                                                                                      |
| `buildWorksheetSteps`   | function | Builds the ordered `Step` rows for a resolved `Worksheet`.                                                                                                  |
| `buildWorksheet`        | function | Joins a `QuantitativeDefinition` and its `QuantitativeResult` into a `Worksheet` — the rating audit trail.                                                  |
| `buildLineResult`       | function | Builds a rated `LineResult` from a line's evaluated `QuantitativeResult`.                                                                                   |
| `sumAmounts`            | function | Sums defined line amounts.                                                                                                                                  |

Each definition builder returns a fresh object and omits an absent optional key
entirely:

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

| API           | Kind     | Summary                                                                                                                         |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `createRater` | function | Creates a rating orchestrator over the shared quantitative engine, seeded from `RaterOptions` and returning a `RaterInterface`. |

`createRater` returns a live entity that owns an engine unless one is injected, so every
rater is destroyed when its work is done.

#### Create a rater

The demonstration builds a rater over its own engine and destroys that rater:

```ts
import { createRater } from '@orkestrel/rater'

const rater = createRater()
rater.destroy()
```

### Classes

| API     | Kind  | Summary                                                                                                                                   |
| ------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Rater` | class | Orchestrates rating — owns (or receives) the shared quantitative reasoning engine and projects results into the rating domain vocabulary. |

## Methods

The public methods of `RaterInterface` — one table, keyed by its backticked name, every
call-signature member listed, and the `readonly` data member `emitter` left off it.
`Rater` exposes exactly its interface's methods, so this doubles as the per-instance
method surface.

#### `RaterInterface`

The array-of-lines overload of `rate` is declared first so a plain line list resolves
to that form; each overload rates exactly one subject. `destroy()` is idempotent — it
destroys an owned engine (never an injected one), then the emitter last. Afterwards
every other method throws `RaterError` `'DESTROYED'`.

| Method    | Returns        | Summary                                                                                                    |
| --------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| `rate`    | `RatingResult` | Rates an array of lines, or a `RatingDefinition`, against one subject over the shared quantitative engine. |
| `destroy` | `void`         | Destroys an owned engine and then the emitter, and does nothing on a later call.                           |

The array-of-lines and rating-definition forms of `rate` each take one subject and
return equal results for the same lines:

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

## Tests

- [`tests/guides.test.ts`](../tests/guides.test.ts) — the `## Surface` ↔ `src/core` bijection (value and type exports), the `RaterInterface` ↔ `Rater` method bijection, and the equality gate: every `Summary` cell against its declaration's description paragraph, the titled `Create a rater` fence against the `@example` block of that title (pinned so the titled pair cannot be retired silently), and the README pitch against this guide's tagline. It also runs the flagship fences and asserts the values their comments claim.
- [`tests/src/core/Rater.test.ts`](../tests/src/core/Rater.test.ts) — line selection (only the supplied lines are evaluated, exactly once each, and an omitted line never is), the result shape (`LineResult` carries an `amount` only on a successful worksheet; `RatingResult` carries a `total` only when one is defined), quantitative-only dispatch against an injected engine that also carries a logical reasoner, rating failures (a missing lookup key with no fallback, a failed required check), totals (a custom `TotalHandler`, an all-failed rating, an empty line list), immutability against frozen inputs, engine ownership and `destroy` (idempotence, `'DESTROYED'` afterwards, an injected engine surviving), the array-of-lines and rating-definition `rate` overloads agreeing, the `'DEFINITION'` and `'MISMATCH'` errors, the `rate` event firing once per call, `labels` threading into a resolved `Evidence.label`, the defensive fallback for a non-quantitative or malformed engine result, and the finite-arithmetic guarantees.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — `createRater` returns a rater usable immediately, threads an injected engine, a total override, labels, and an `on.rate` hook together, and tears down an owned engine on `destroy` while leaving an injected one working.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — evidence construction and label application, the factor and group joins with their defaults for an absent result, the step ordering (applied factors, then the group, then the total), the full worksheet join passing `trace`, `errors`, and `success` through, `buildLineResult` carrying an `amount` only on success, `sumAmounts` over defined, negative-zero, overflowing, `NaN`, and opposing-infinity amounts, the definition builders' override merge and optional-key omission, and the round trip from each builder back through its guard.
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — each guard against its accepted shapes, its wrong-typed and missing members, adversarial input (junk, cycles, hostile prototypes, revoked proxies) answered without throwing, the exact `recordOf` posture rejecting an extra key on an authored definition, and the open `objectOf` posture admitting unknown members, prototypes, and class instances on a borrowed result.
