# Program

> A synchronous, deterministic **program engine**. A pure,
> JSON-serializable `ProgramDefinition` composes one published
> `QualificationDefinition` from `@orkestrel/qualifier` with an OPTIONAL
> `RatingDefinition` from `@orkestrel/rater`, plus optional notices, authority, and
> batch aggregate policy. `Program` executes the workflow in one direction: qualify
> the subject, stop on a terminal qualification, select the eligible rating lines,
> rate only those lines, derive status, then evaluate optional authority.
> Qualification decides whether rating happens — a globally ineligible, referred, or
> failed subject never reaches the rater, and scoped ineligibility removes only the
> matching line before the first rating call. Omitting `rating` authors a
> first-class ELIGIBILITY-ONLY program — the rater is never invoked, an eligible
> subject resolves to `'eligible'` (or `'conditional'` under an applied condition),
> and status is never `'unrated'`; an authored rating with zero lines still yields
> `'unrated'`, unchanged.
>
> `Program` performs NO reasoning arithmetic. It owns orchestration and business
> outcomes — notices, authority, status, decisions, and batch aggregates — while
> delegating eligibility to `Qualifier`, amounts and worksheets to `Rater`, and
> logical or quantitative mechanics to the shared `@orkestrel/reason` engine behind
> them. The rater always receives the original subject; qualification and aggregate
> working projections stay private to orchestration. Every output is a fresh
> `ProgramResult` or `AggregateResult` carrying the nested qualification and rating
> evidence, program determinations, trace, errors, status, and optional decision.
> `Program` either receives injected qualifier, rater, and engine instances (never
> destroyed by `Program`) or creates and OWNS one shared quantitative-plus-logical
> engine (`bail: false`), destroyed in `destroy()`. Every `execute` call fires through
> `Program`'s typed `emitter` (AGENTS §13). Source: [`src/core`](../../src/core).
> Surfaced through the `@src/core` barrel.

## Surface

Create a program, execute one subject, and inspect the nested results:

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

const eligible = program.execute({ id: 'risk-1', licensed: true })
eligible.status // 'eligible'
eligible.rating?.total // 100

const ineligible = program.execute({ id: 'risk-2', licensed: false })
ineligible.status // 'ineligible'
ineligible.rating // undefined — the rater was not called

program.destroy()
```

The array overload is declared FIRST (AGENTS §9.2) and performs one aggregate-aware
batch execution:

```ts
const result = program.execute([
	{ id: 'a', licensed: true, amount: 10 },
	{ id: 'b', licensed: false, amount: 20 },
])

result.count // 2
result.subjects[0]?.status // 'eligible'
result.subjects[1]?.status // 'ineligible'
result.tallies.eligible.count // 1
result.tallies.ineligible.count // 1
```

A `ProgramManager` stores compiled programs without hiding them behind a second
business facade — the manager owns collection lifecycle, each `Program` owns
execution:

```ts
import { createProgramManager } from '@orkestrel/program'

const manager = createProgramManager()
manager.add(definition)

const standard = manager.program('standard')
standard?.execute(subject)

manager.destroy()
```

### Types

| Type                      | Kind      | Shape                                                                                                                                          |
| ------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Decision`                | type      | `'approved' \| 'denied' \| 'submitted'` — a final authority outcome.                                                                           |
| `Status`                  | type      | `'ineligible' \| 'referral' \| 'conditional' \| 'unrated' \| 'eligible'`.                                                                      |
| `ProgramEffect`           | type      | `'notice' \| 'limit'` — post-qualification program determinations.                                                                             |
| `ProgramErrorCode`        | type      | `'DUPLICATE' \| 'MISSING' \| 'DEFINITION' \| 'MISMATCH' \| 'RESERVED' \| 'DESTROYED'`.                                                         |
| `ProgramInput`            | interface | `{ description?, notices?, authority?, aggregate?, metadata? }`.                                                                               |
| `NoticeInput`             | interface | `{ scope? }` — optional fields accepted by `noticeDefinition`.                                                                                 |
| `AggregateInput`          | interface | `{ by?, gates? }` — optional fields accepted by `aggregateDefinition`.                                                                         |
| `Notice`                  | interface | `{ id, message, scope? }` — an authored unconditional program notice.                                                                          |
| `Determination`           | interface | `{ id, effect, applied, scope?, message?, premises }` — one notice or authority limit.                                                         |
| `AggregateDefinition`     | interface | `{ fields, by?, gates? }` — batch sums (`FieldPath`s), optional partition field, optional gates.                                               |
| `AggregateProjection`     | interface | `{ count, sums, group? }` — private per-subject aggregate context.                                                                             |
| `AggregateGroup`          | interface | `{ key, count, sums }` — one partition.                                                                                                        |
| `Tally`                   | interface | `{ count, sums }` — one status tally.                                                                                                          |
| `ProgramDefinition`       | interface | `{ id, name, description?, qualification, rating?, notices?, authority?, aggregate?, metadata? }`.                                             |
| `ProgramResult`           | interface | `{ id, name, eligibility, status, decision?, qualification, rating?, determinations, success, trace, errors }`.                                |
| `AggregateResult`         | interface | `{ id, name, subjects, determinations, groups, tallies, count, sums, success, trace, errors }`.                                                |
| `ProgramValidationResult` | interface | `{ valid, errors, warnings }`.                                                                                                                 |
| `ProgramEventMap`         | type      | `qualify(result)` · `rate(result)` · `determine(result)` · `decide(decision, result)` · `execute(result)` · `aggregate(result)` · `destroy()`. |
| `ProgramOptions`          | interface | `{ qualifier?, rater?, engine?, validate?, labels?, on?, error? }`.                                                                            |
| `ProgramInterface`        | interface | `id` / `name` / `definition` / `emitter` + `execute` / `validate` / `destroy`.                                                                 |
| `ProgramManagerEventMap`  | type      | `add(id)` · `remove(id)` · `destroy()`.                                                                                                        |
| `ProgramManagerOptions`   | interface | `{ qualifier?, rater?, engine?, programs?, validate?, labels?, on?, error? }`.                                                                 |
| `ProgramManagerInterface` | interface | Ordered program manager with singular/plural accessors and lifecycle.                                                                          |

Every public data member is `readonly`, every optional key is omitted rather than
`undefined`, and each name is single-word within its entity (AGENTS §4.1). Qualifier
supplies `Eligibility`, `Premise`, `QualificationDefinition`, and `QualificationResult`;
rater supplies `RatingDefinition` and `RatingResult`; reason supplies
`LogicalDefinition`, `Subject`, and the engine; contract supplies `FieldPath` and
`JSONValue`; the emitter supplies the observation types.

### Constants

| API                        | Kind  | Summary                                             |
| -------------------------- | ----- | --------------------------------------------------- |
| `DEFAULT_PROGRAM_VALIDATE` | const | `true` — validate a definition at construction.     |
| `STATUS_PRECEDENCE`        | const | Stable status order for complete tally records.     |
| `ELIGIBILITY_DECISIONS`    | const | Deterministic decision for each global eligibility. |
| `AGGREGATE_KEY`            | const | `'aggregate'` — private aggregate context key.      |
| `OUTCOME_KEY`              | const | `'outcome'` — private authority context key.        |

Every constant is `Object.freeze`d. The two reserved keys exist only for composed
program execution — neither sibling package reserves these subject keys.
`ELIGIBILITY_DECISIONS` maps each global eligibility to its decision, and
`STATUS_PRECEDENCE` fixes the order of a complete tally record (it is not an opaque
severity reducer for status).

### Errors

| API              | Kind     | Summary                                       |
| ---------------- | -------- | --------------------------------------------- |
| `ProgramError`   | class    | Coded programmer error with optional context. |
| `isProgramError` | function | Narrow a caught value to `ProgramError`.      |

```ts
import { isProgramError, ProgramError } from '@orkestrel/program'

try {
	throw new ProgramError('RESERVED', 'Subject contains a reserved program key', 'aggregate')
} catch (error) {
	if (isProgramError(error)) error.code // 'RESERVED'
}
```

| Code         | Meaning                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `DUPLICATE`  | A manager already contains the program id, or an authored definition has a duplicate rating-line or notice id. |
| `MISSING`    | A notice, ruling scope, or other authored reference names no rating line.                                      |
| `DEFINITION` | Program, qualification, rating, authority, or aggregate policy is invalid.                                     |
| `MISMATCH`   | An injected entity or returned result has the wrong contract.                                                  |
| `RESERVED`   | A subject already carries `aggregate` or `outcome`.                                                            |
| `DESTROYED`  | An operation was attempted after teardown.                                                                     |

Eligibility and rating failures remain nested result evidence rather than throws.

### Validators

Total, exact guards composed from sibling guards and `@orkestrel/contract`
combinators — adversarial input returns `false`, never throws. Like the sibling
packages, only AUTHORED/input types get a guard: `Determination`, `ProgramResult`,
`AggregateResult`, `Tally`, `AggregateGroup`, and `AggregateProjection` are
internally-produced results, never untrusted input, so they carry no guard of their
own.

| API                     | Kind     | Narrows to             |
| ----------------------- | -------- | ---------------------- |
| `isDecision`            | const    | `Decision`.            |
| `isStatus`              | const    | `Status`.              |
| `isProgramEffect`       | const    | `ProgramEffect`.       |
| `isNotice`              | function | `Notice`.              |
| `isAggregateDefinition` | function | `AggregateDefinition`. |
| `isProgramDefinition`   | function | `ProgramDefinition`.   |

```ts
import {
	isAggregateDefinition,
	isDecision,
	isNotice,
	isProgramDefinition,
	isStatus,
} from '@orkestrel/program'

isDecision('approved') // true
isStatus('conditional') // true
isNotice({ id: 'file', message: 'Subject retained for audit' }) // true
isAggregateDefinition({ fields: ['amount'], by: 'location' }) // true
isProgramDefinition(definition) // true
```

`isProgramDefinition` establishes exact shape only. `Program.validate` additionally
checks semantic references and delegates nested validation to qualifier and rater.

### Helpers

The program helpers are pure orchestration leaves. They do not reproduce qualifier,
rater, or reason logic — message interpolation and rich premise construction for
authority and aggregate-gate rules reuse `@orkestrel/qualifier`'s own
`interpolateMessage`, `findRule`, and `logicalPremises` (all public qualifier exports,
generic over any `Rule`/`Subject`/`EvaluatorInterface`) rather than re-implementing
them. `Program` owns one stateless `#evaluator` (created with `createEvaluator()`,
never destroyed — it holds no state to tear down) purely to drive that reuse.

| API                         | Kind     | Summary                                                                                                                                         |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `copyJSONValue`             | function | Deep-clone a `JSONValue` into a fresh tree that shares no reference with the input — used for defensive metadata copies.                        |
| `selectProgramLines`        | function | Select rating-line ids from scoped qualification eligibility.                                                                                   |
| `deriveStatus`              | function | Derive final status from a program definition's rating policy plus qualification and rating evidence.                                           |
| `decideEligibility`         | function | Map global eligibility to its deterministic decision.                                                                                           |
| `buildNotices`              | function | Resolve authored notices into applied determinations.                                                                                           |
| `buildLimits`               | function | Convert a logical result's applied rules (authority or aggregate gates) into `limit` determinations, with rich premises.                        |
| `buildProgramResult`        | function | Assemble a program result before or after rating.                                                                                               |
| `buildOutcomeProjection`    | function | Build the private authority projection.                                                                                                         |
| `buildQualificationSubject` | function | Add aggregate context to a private subject copy.                                                                                                |
| `findMissingScopes`         | function | Find authored scopes absent from the rating definition.                                                                                         |
| `hasReservedKey`            | function | Detect `aggregate` or `outcome` on a caller subject.                                                                                            |
| `assertProgramSubject`      | function | Assert a subject record and reserved-key safety.                                                                                                |
| `assertProgramDefinition`   | function | Assert always-on construction invariants — missing scope references and duplicate rating-line or notice ids — regardless of `options.validate`. |
| `validateProgramDefinition` | function | Validate nested definitions, references, authority, and aggregate policy.                                                                       |
| `formatGroupKey`            | function | Coerce a subject's partition-key field to its `String`-coerced group key.                                                                       |
| `sumFields`                 | function | Fold one subject's finite aggregate field values into a fresh sums record.                                                                      |
| `aggregateSums`             | function | Sum configured fields across subjects.                                                                                                          |
| `aggregateGroups`           | function | Partition subjects and sum fields per key.                                                                                                      |
| `buildAggregateProjection`  | function | Build one subject's overall and optional group aggregate context.                                                                               |
| `buildAggregateRecord`      | function | Build the reserved aggregate-gate subject.                                                                                                      |
| `emptySums`                 | function | Build a zero record for configured fields.                                                                                                      |
| `emptyTallies`              | function | Build complete zero tallies in status order.                                                                                                    |
| `completeTallies`           | function | Fill missing statuses in a partial tally record.                                                                                                |
| `tallyProgram`              | function | Add one subject and its fields to the result-status tally.                                                                                      |
| `buildAggregateResult`      | function | Assemble one batch result, folding an optional aggregate-gate evaluation's `trace`/`errors` in and requiring it error-free for `success`.       |

The per-subject orchestration leaves guard the subject, select surviving lines, and
map eligibility to a decision:

```ts
import {
	assertProgramSubject,
	decideEligibility,
	hasReservedKey,
	selectProgramLines,
} from '@orkestrel/program'

hasReservedKey({ id: 'r1' }) // false
hasReservedKey({ id: 'r1', aggregate: {} }) // true
assertProgramSubject({ id: 'r1' }) // narrows to Subject; throws ProgramError('RESERVED') on a reserved key
assertProgramDefinition(definition) // throws ProgramError('MISSING' | 'DUPLICATE') at construction, regardless of options.validate
selectProgramLines(lines, { wind: 'ineligible' }) // every line except the 'wind' line
decideEligibility('eligible') // 'approved'
```

The batch leaves sum configured fields, partition subjects, seed zero records, and
deep-copy metadata:

```ts
import {
	aggregateGroups,
	aggregateSums,
	copyJSONValue,
	emptySums,
	formatGroupKey,
	sumFields,
} from '@orkestrel/program'

const subjects = [
	{ id: 'a', location: 'west', total: 100 },
	{ id: 'b', location: 'west', total: 200 },
	{ id: 'c', location: 'east', total: 50 },
]

aggregateSums(subjects, ['total']) // { total: 350 }
aggregateGroups(subjects, ['total'], 'location') // [{ key: 'west', count: 2, sums: { total: 300 } }, { key: 'east', count: 1, sums: { total: 50 } }]
formatGroupKey({ location: 'west' }, 'location') // 'west' — String-coerced, so a missing field and '' land in the same partition
sumFields({ total: 0 }, subjects[0], ['total']) // { total: 100 } — a fresh record, only finite numbers contribute
emptySums(['total']) // { total: 0 }
copyJSONValue({ tier: 'gold', flags: [1, 2] }) // a fresh clone that shares no reference with the input
```

### Factories

| API                    | Kind     | Builds…                                |
| ---------------------- | -------- | -------------------------------------- |
| `createProgram`        | function | One compiled `ProgramInterface`.       |
| `createProgramManager` | function | One ordered `ProgramManagerInterface`. |
| `programDefinition`    | function | A fresh `ProgramDefinition`.           |
| `noticeDefinition`     | function | A fresh `Notice`.                      |
| `aggregateDefinition`  | function | A fresh `AggregateDefinition`.         |

Every factory returns a fresh value, copies collections, and omits absent optional
keys entirely.

```ts
import {
	aggregateDefinition,
	createProgram,
	createProgramManager,
	noticeDefinition,
	programDefinition,
} from '@orkestrel/program'

const aggregate = aggregateDefinition(['amount'], { by: 'location' })
const notice = noticeDefinition('audit', 'Program {{program}} executed')

const definition = programDefinition('standard', 'Standard', qualification, rating, {
	notices: [notice],
	aggregate,
})

const program = createProgram(definition)
const manager = createProgramManager({ programs: [definition] })
```

### Entities

| API              | Kind  | Summary                                                                                                  |
| ---------------- | ----- | -------------------------------------------------------------------------------------------------------- |
| `Program`        | class | Compiles one definition over a qualifier and rater; executes single subjects or aggregate-aware batches. |
| `ProgramManager` | class | Ordered manager of compiled programs sharing one qualifier and one rater.                                |

The package has no entity named `Rater`. Rating remains a sibling concern.

## Methods

#### `ProgramInterface`

The array overload is declared first (AGENTS §9.2). `execute` is the correct verb
because it performs a composed workflow rather than qualification or rating alone.

| Method     | Returns                              | Behavior                                                                       |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| `execute`  | `AggregateResult` or `ProgramResult` | Execute a `readonly Subject[]` as one aggregate-aware batch, or one `Subject`. |
| `validate` | `ProgramValidationResult`            | Validate this program and all nested definitions.                              |
| `destroy`  | `void`                               | Idempotent teardown of the program emitter and owned dependencies.             |

```ts
const aggregate = program.execute(subjects)
const single = program.execute(subject)
const validation = program.validate()

program.destroy()
```

After destroy, `execute` and `validate` throw `ProgramError('DESTROYED')`.

#### `ProgramManagerInterface`

The manager follows the singular/plural accessor and batch-removal conventions
(AGENTS §9).

| Method     | Returns                         | Behavior                                                                                                         |
| ---------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `has`      | `boolean`                       | Whether an id is compiled.                                                                                       |
| `program`  | `ProgramInterface \| undefined` | Look up one program.                                                                                             |
| `programs` | `readonly ProgramInterface[]`   | Return all programs in order.                                                                                    |
| `add`      | `ProgramInterface`              | Validate, compile, and append one program.                                                                       |
| `remove`   | `boolean` or `void`             | Remove listed ids (`true` only if every id existed), remove one id (`boolean`), or remove all programs (`void`). |
| `destroy`  | `void`                          | Destroy programs, owned dependencies, and emitter last.                                                          |

```ts
const manager = createProgramManager()

manager.add(definition)
manager.has(definition.id) // true
manager.program(definition.id)?.execute(subject)
manager.programs()
manager.remove(definition.id)
manager.remove()
manager.destroy()
```

The manager does not expose `execute`. Consumers deliberately choose a program, which
keeps execution and collection responsibilities separate.

## Contract

### Execution order

For one subject:

1. assert subject shape and reserved-key safety
2. qualify against the optional private aggregate projection
3. emit `qualify`
4. stop if qualification failed
5. stop if global eligibility is `ineligible` or `referral`
6. select rating lines from scoped eligibility
7. skip rating when no line remains
8. rate the selected lines against the original subject
9. emit `rate`
10. build notices
11. derive status
12. build the preliminary program result
13. run optional authority against the private outcome projection
14. build and emit limit determinations
15. derive the optional decision
16. emit `decide` when present
17. emit `execute`

Every stop still returns a complete, successful business result when the terminal
eligibility itself was valid.

When `ProgramDefinition.rating` is omitted, step 6 selects from an empty line list,
step 7 always skips rating, and `rating` stays `undefined` for the whole execution —
the program is eligibility-only and the rater is never invoked, yet the remaining
steps (notices, status, authority, decision) still run.

### Qualification is terminal

A globally `ineligible` or `referral` qualification — or a failed one — is terminal:
the rater is never called and `rating` stays `undefined`.

```ts
const result = program.execute({ id: 'risk-2', licensed: false })

result.eligibility // 'ineligible'
result.rating // undefined — the rater was never called
result.success // true — a valid ineligible outcome still succeeds
```

`ineligible` and `referral` are outcomes, not technical failures, so they do not make
`ProgramResult.success` false; only a qualification, rating, or authority error does.

### Scoped eligibility

A scope names a rating-line id.

| Scoped result | Rating behavior | Program status                                             |
| ------------- | --------------- | ---------------------------------------------------------- |
| absent        | line selected   | unchanged                                                  |
| `eligible`    | line selected   | unchanged                                                  |
| `ineligible`  | line omitted    | `conditional` when another line rates; otherwise `unrated` |
| `referral`    | line omitted    | `referral`                                                 |

This table applies when `rating` is authored — see Eligibility-only (Patterns) for
the omitted-rating case, where `unrated` never occurs. Line selection happens BEFORE
the first rating call — an excluded line is never evaluated merely to discard its
amount. A ruling or notice scope naming no line in `ProgramDefinition.rating?.lines`
(including every scope when `rating` is omitted entirely) is a hard authoring error —
`assertProgramDefinition` throws `ProgramError('MISSING')` at construction.

### Conditions

An applied `condition` never removes a line — every eligible line still rates, and the
result becomes `conditional`. A scoped `restriction` behaves the same way for status:
it removes its own line but leaves the program `conditional` rather than globally
`ineligible` (an unscoped `restriction` already determines global ineligibility in
`Qualifier`).

### Rating failures

A rating failure is not converted into ineligibility:

- qualification remains eligible
- the failed line amount remains absent
- rating evidence remains nested
- program status becomes `unrated`
- program success becomes false because execution encountered technical errors
- authority receives `rated: true` and `status: 'unrated'`
- authority still runs and may emit `limit` determinations; the `decision` is suppressed because `status` is `unrated` (one of the four decision gates, below)

Scoped referral keeps global eligibility `eligible` while status remains `referral`, so a clean authority still yields an `approved` decision.

### Notices

Notices are unconditional authored output. They:

- are emitted whether the subject is eligible or terminal
- may carry a scope for presentation
- never affect eligibility, status, line selection, or decision
- interpolate against the original subject
- are represented as `Determination` with `effect: 'notice'`

### Authority

Authority is optional and runs last, over a private `outcome` projection of the
assembled result — its id, eligibility, status, whether it rated, total, and scoped
eligibility — never the mutable internal state of either sibling engine. Applied
authority rules become `limit` determinations. A `decision` is present only when all
four gates hold:

1. an authority definition exists on the program
2. execution SUCCEEDED — qualification, rating (when it ran), and authority all produced no errors
3. no `limit` determination applied
4. status is not `unrated`

A technically-failed qualification therefore never yields a decision, even when an
authority definition exists and would otherwise fire cleanly.

The decision is deterministic in global eligibility (`eligible → approved`,
`ineligible → denied`, `referral → submitted`), preserving the distinction between
approved-with-conditions and denied — a scoped restriction can yield
`status: 'conditional'` with `decision: 'approved'`.

### Aggregate execution

For a subject array:

1. validate every subject and reserved key
2. collect aggregate fields from `definition.aggregate`
3. compute overall sums
4. compute optional groups
5. build each subject's aggregate projection
6. execute subjects in input order
7. tally every result by status
8. run optional aggregate gates against the batch aggregate record (`count`, `sums`, `groups`)
9. convert applied rules to batch `limit` determinations
10. emit `aggregate`

The aggregate-gate evaluation's `trace` and `errors` fold into
`AggregateResult.trace` / `AggregateResult.errors` alongside every subject's own, and
`AggregateResult.success` additionally requires the gate evaluation to have produced
no errors — a gate evaluation failure fails the batch result even when every subject
execution succeeded.

Batch aggregation does not modify individual rating subjects.

### Aggregate projection

The qualifier may read aggregate context through the reserved `aggregate` key on a
private subject copy:

```ts
{
	...subject,
	aggregate: { count, sums, group },
}
```

The rater receives the original `subject`, never that private copy. This difference is
intentional and is covered by integration tests.

### Reserved keys

Caller subjects must not contain `aggregate` or `outcome` — these keys are private
program namespaces used only for reason-engine projections. A subject that already
carries either key is rejected with `ProgramError('RESERVED')` before qualification.

### Status

Status is explicit policy, not an opaque severity reducer. It resolves in this order:

1. global ineligible
2. global or scoped referral
3. `ProgramDefinition.rating` is omitted (eligibility-only program) → `conditional` under an applied condition or scoped restriction, otherwise `eligible` — NEVER `unrated`
4. no successful rating (including an AUTHORED rating with zero lines) → `unrated`
5. applied condition or scoped restriction → `conditional`
6. otherwise → `eligible`

`STATUS_PRECEDENCE` exists only for complete tally output, never for hidden status
logic.

### Decision

`Decision` is authority output:

| Eligibility  | Decision    |
| ------------ | ----------- |
| `eligible`   | `approved`  |
| `ineligible` | `denied`    |
| `referral`   | `submitted` |

No decision is emitted without an authority definition.

### Success

`ProgramResult.success` indicates execution integrity:

- valid ineligibility can succeed
- valid referral can succeed
- qualification errors fail
- rating errors fail
- authority errors fail
- notices do not fail
- a deliberately unrated result caused only by scoped exclusions can succeed

`AggregateResult.success` requires every subject execution to succeed AND the batch
aggregate-gate evaluation (when configured) to have produced no errors.

### Ownership

A standalone `Program`:

- borrows an injected reason engine or creates one shared quantitative-plus-logical engine
- injects that engine into any internally created qualifier and rater
- borrows independently injected qualifier and rater instances
- destroys only owned dependencies, its emitter last, and is idempotent — `destroy()`
  sets the destroyed flag FIRST, so a listener re-entering `destroy()` is a no-op
- when construction fails (an invalid definition under `options.validate`), tears down
  everything already allocated — owned dependencies and the emitter, firing `destroy`
  — before rethrowing

A `ProgramManager`:

- creates or borrows one shared quantitative-plus-logical reason engine
- injects the same qualifier, rater, and engine into every compiled program
- destroys programs first, then owned shared dependencies, then its emitter last —
  reentrancy-safe the same way, the destroyed flag is set FIRST
- when a seed program fails during construction, tears the manager down — draining
  and destroying every program already compiled (each firing `remove` first), then
  owned shared dependencies, then the emitter — before rethrowing the original error

### Events

Single execution event order:

```text
qualify
rate?             only when at least one line is selected
determine*        notices, then limits
decide?           only when authority permits
execute
```

Batch execution emits the per-subject events first, then aggregate determinations,
then `aggregate`. Events are synchronous, and listener failures are isolated by the
owned emitter.

### Validation

`Program.validate` (`validateProgramDefinition`) checks:

1. exact shape via `isProgramDefinition` — this alone establishes rating structure and authority/gates shape, so validate performs no redundant re-check of either
2. non-empty id
3. non-empty name
4. nested qualification validation, delegated to the injected qualifier and prefixed `qualification:`
5. duplicate rating-line ids (when a rating is authored)
6. every qualification ruling scope names an existing rating line — when NO rating is authored, ANY scope is an error, because no line exists to match
7. duplicate notice ids
8. every notice scope names an existing rating line — same empty-line rule when no rating is authored
9. authority validated semantically by the shared reason engine, prefixed `authority:`
10. aggregate fields are unique and non-empty
11. aggregate `by` is non-empty when present
12. aggregate gates validated semantically by the shared reason engine, prefixed `aggregate:`

Always-on construction assertions run independently of `Program.validate` and of
`options.validate`: `assertProgramDefinition` rejects a missing scope reference
(`ProgramError('MISSING')`) and a duplicate rating-line or notice id
(`ProgramError('DUPLICATE')`) at construction, every time.

Qualification passes project their derivations under `qualification.<passId>` (the
qualifier reserves the `qualification` subject key), and authority runs against a
program-built private record whose only key is `outcome` — so an authored pass or
rule id can never collide with a caller subject key or either reserved working key;
there is no separate collision check to run.

Warnings stay conservative (validators do not attempt full logical theorem proving)
and include:

- a program whose rating defines no lines validates with the warning `Program rating has no lines`, and every eligible subject then resolves to `status: 'unrated'` because no line can rate (an OMITTED rating produces no such warning — it is eligibility-only by design, never `unrated`)
- aggregate gates defined without aggregate fields

## Patterns

### Globally ineligible

```ts
const result = program.execute({ id: 'risk-1', licensed: false })

result.qualification.eligibility // 'ineligible'
result.rating // undefined
result.status // 'ineligible'
```

No quantitative reasoner call occurs.

### Eligibility-only

```ts
const definition = programDefinition('gate-only', 'Gate only', qualification)
const program = createProgram(definition)

const result = program.execute({ id: 'risk-1', licensed: true })

result.rating // undefined — the rater is never invoked
result.status // 'eligible', never 'unrated'
```

Omitting `rating` authors an eligibility-only program: qualification and its optional
authority still run in full, but rating and its rating-line references disappear from
the workflow entirely.

### Rating-only

```ts
const qualification = qualificationDefinition('all', 'All risks', [])
const definition = programDefinition('rate-only', 'Rate only', qualification, rating)
const program = createProgram(definition)

const result = program.execute({ id: 'risk-1' })

result.qualification.eligibility // 'eligible' — an empty qualification qualifies every subject
result.rating?.lines.length // every authored line rates
```

An empty qualification (no logical passes) qualifies every subject `eligible` with no
scoped exclusions, so every authored line rates unconditionally.

### Scoped exclusion

```ts
const qualification = qualificationDefinition(
	'property-qualification',
	'Property qualification',
	[windGates],
	{
		rulings: [
			rulingDefinition('frame', 'wind-gates', 'frame', 'restriction', {
				scope: 'wind',
				message: 'Wind is unavailable for Frame construction',
			}),
		],
	},
)

const rating = ratingDefinition('property-rating', 'Property rating', [
	lineDefinition('wind', 'Wind', windRate),
	lineDefinition('exWind', 'Ex-Wind', exWindRate),
])

const result = createProgram(
	programDefinition('property', 'Property', qualification, rating),
).execute({
	id: 'risk-1',
	construction: 'Frame',
})

result.rating?.lines.map((line) => line.id) // ['exWind']
result.status // 'conditional'
```

The wind definition is not evaluated.

### Scoped referral

```ts
rulingDefinition('coastal-review', 'wind-gates', 'coastal-review', 'referral', {
	scope: 'wind',
	message: 'Wind requires underwriter review',
})
```

The wind line is omitted and program status is `referral`.

### Conditions

```ts
rulingDefinition('protective-device', 'gates', 'protective-device', 'condition', {
	message: 'Install an approved protective device',
})
```

All eligible lines rate. The result becomes `conditional`.

### Notices

```ts
const notice = noticeDefinition('minimum', 'Minimum earned premium applies')

const definition = programDefinition('standard', 'Standard', qualification, rating, {
	notices: [notice],
})
```

### Authority

```ts
const authority = logicalDefinition('authority', 'Final authority', [
	rule(
		'manual',
		[atom(['outcome', 'status'], 'equals', 'conditional')],
		atom('limited', 'equals', true),
		{
			name: 'Manual authority required',
			description: 'Conditional outcomes require manual authority',
		},
	),
])

const definition = programDefinition('standard', 'Standard', qualification, rating, { authority })
```

A conditional result receives a `limit` determination and no decision.

### Aggregate qualification

```ts
const aggregate = aggregateDefinition(['total'], { by: 'location' })

const qualification = qualificationDefinition(
	'portfolio-qualification',
	'Portfolio qualification',
	[
		logicalDefinition('aggregate-gates', 'Aggregate gates', [
			rule(
				'location-cap',
				[atom(['aggregate', 'group', 'sums', 'total'], 'above', 5_000_000)],
				atom('blocked', 'equals', true),
			),
		]),
	],
	{
		rulings: [
			rulingDefinition('location-cap', 'aggregate-gates', 'location-cap', 'restriction', {
				message: 'Location total exceeds the program maximum',
			}),
		],
	},
)
```

Each subject qualifies against its own group projection while rating still receives
the original subject.

### Aggregate gates

```ts
const gates = logicalDefinition('batch-gates', 'Batch gates', [
	rule(
		'portfolio-cap',
		[atom(['aggregate', 'sums', 'total'], 'above', 20_000_000)],
		atom('limited', 'equals', true),
	),
])

const aggregate = aggregateDefinition(['total'], { gates })
```

These gates create batch determinations. They do not retroactively change individual
qualification or rating results.

### Shared dependencies

```ts
const reason = createReason({
	reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
	bail: false,
})
const qualifier = createQualifier({ engine: reason })
const rater = createRater({ engine: reason })

const manager = createProgramManager({ qualifier, rater, engine: reason, programs: definitions })

manager.destroy()

// Injected dependencies remain caller-owned.
qualifier.destroy()
rater.destroy()
reason.destroy()
```

Build an injected shared engine with `bail: false`, as shown above — matching the
engine `Program` creates when none is injected. Ordinary evaluation failures (a failed
factor, an unresolvable field) surface as nested result evidence regardless of `bail`;
`bail` governs only a reasoner's own internal throw, which `bail: true` rethrows
through `program.execute` as the sibling's error instead of nesting it. An engine
missing a required reasoner always throws on dispatch, bypassing `bail` entirely —
`Program.validate` reports that misconfiguration up front.

### Observing

```ts
const program = createProgram(definition, {
	on: {
		qualify: (result) => audit.qualification(result),
		rate: (result) => audit.rating(result),
		determine: (result) => audit.determination(result),
		decide: (decision, result) => audit.decision(decision, result),
		execute: (result) => audit.program(result),
		aggregate: (result) => audit.aggregate(result),
	},
	error: (error, event) => audit.listenerError(error, event),
})
```

## Tests

Tests mirror the source structure under `tests/src/core` —
`validators.test.ts`, `helpers.test.ts`, and `factories.test.ts` for the centralized
surfaces, `programs/Program.test.ts` and `programs/ProgramManager.test.ts` for the
entities, and `integrations.test.ts` for cross-entity composition — and use real
qualifier, rater, and reason instances rather than mocks.

### Program cases

The program suite proves the composed workflow: it qualifies before rating; never
rates a globally ineligible, referred, or failed subject; rates only eligible scopes
and skips rating when no scope remains; passes the original subject to the rater;
keeps the aggregate projection private to qualification; preserves nested
qualification findings and rating worksheets; derives conditional, referral, and
unrated status; runs authority last and omits the decision when a limit applies,
status is `unrated`, or execution technically failed; maps eligibility to decision;
emits events in contract order; destroys only owned dependencies; rejects reserved
subject keys and post-destroy calls; and never mutates definitions, subjects, or
sibling results.

The hardened suite additionally proves: an aggregate-gate evaluation error fails and
surfaces on `AggregateResult`; a technically-failed qualification never yields a
decision even with a clean authority; eligibility-only programs resolve status and
decisions correctly, never call the rater, and still tally correctly in a batch;
batch execution rejects a reserved-key subject before any work runs; an all-lines
scoped-out subject resolves `unrated`; listener throws are isolated through each
entity's `error` handler; `destroy`/`execute` reentrancy from within a listener, and
`ProgramManager` reentrancy from a `remove` listener, are all no-ops or safe; a
construction failure tears down everything already allocated (firing `destroy` /
`remove` hooks) while leaving injected dependencies untouched; duplicate rating-line
and notice ids are rejected at construction even under `validate: false`; hostile
subjects carrying `__proto__` / `constructor` keys never pollute a prototype;
aggregate numeric edges (`NaN`, `Infinity`, non-numeric, and absent values all
contribute zero; nested field paths sum correctly) plus group-key coercion
collisions, first-seen group order, large batches, and duplicate subject ids are all
covered; validation branch messages match exactly; notice interpolation handles a
missing token, nested paths, and en-US thousands grouping; and a limit determination
for a description-less rule omits `message`.

### No-rate and original-subject proofs

A recorder-backed rater — a real `RaterInterface` that records every subject and line
selection it receives without rating — proves the load-bearing invariants directly: a
globally ineligible subject produces no recorded call, an aggregate execution records
only original subjects (never the private `aggregate` projection), and a scoped
restriction records only the surviving line ids. The recorder's leading-underscore
callback parameters are justified callback-conformance bindings in the shared test
collaborator, not production source.

### Batch and manager cases

The batch suite proves overall sums, first-seen group order, per-subject group
projections, complete zero tallies, aggregate gates running once, and an empty batch.
The manager suite proves ordered seeding, duplicate-id rejection, defensive program
arrays, removal of one / listed / all programs, and that one shared qualifier, rater,
and engine back every program.

### Shared-engine ownership

An integration test injects one shared reason engine (plus a qualifier and rater over
it) into a manager and asserts the injected trio survives `manager.destroy()`, while a
standalone program destroys its own engine exactly once and idempotently.

### Public parity

`tests/src/core/integrations.test.ts` asserts the barrel exports only program
concerns — it must not re-export quantitative reason or rating implementation
symbols such as `QuantitativeReasoner`, `Factor`, `WorksheetFactor`, or `Rater`. It
consumes `RaterInterface` without claiming ownership of `Rater`.

### Gates

Run scoped gates before commit:

```text
npm run format
npm run lint
npm run check
npm run build
npm run test:src:core
```

Guide parity must verify every backticked export and every `ProgramInterface` and
`ProgramManagerInterface` method.

## Practices

1. Define `types.ts` before implementation.
2. Keep `execute` as the program verb.
3. Keep `qualify` and `rate` on their owning entities.
4. Qualify before selecting or rating lines.
5. Stop on global ineligibility, referral, or qualification failure.
6. Select scopes before the first rater call.
7. Pass the original subject to the rater.
8. Keep aggregate and outcome projections private.
9. Preserve sibling results as nested values.
10. Derive status explicitly, not through opaque precedence reduction.
11. Treat decisions as authority output.
12. Keep notices informational.
13. Share dependencies deliberately and document ownership.
14. Return fresh objects and defensive arrays.
15. Reserve throws for caller misuse and lifecycle errors.
16. Add no unsolicited dependency.
17. Keep helpers pure and self-descriptive.
18. Keep program management separate from execution.
19. Keep docs and exports bijective.
20. Add no compatibility re-exports for moved symbols.
