# Guides

A dual-axis index into this repository's guides — by concept, and by directory.

## By concept

| Concept | Spec                       | Source                    | Tests                                 |
| ------- | -------------------------- | ------------------------- | ------------------------------------- |
| Program | [`program.md`](program.md) | [`src/core`](../src/core) | [`tests/src/core`](../tests/src/core) |

## By directory

| Directory  | Guide                      |
| ---------- | -------------------------- |
| `src/core` | [`program.md`](program.md) |

## Dependency reference

[`reason.md`](reason.md) is a byte-identical mirror of the guide for
`@orkestrel/reason` — a runtime dependency. It documents **that package's**
surface (the typed reasoning engine: definitions, subjects, reasoners, and the
builder family), not anything sourced in this repo; it is kept here so a reader
of this package can see the engine every evaluation is delegated to without
leaving this guide set.

[`contract.md`](contract.md) is a byte-identical mirror of the guide for
`@orkestrel/contract` — a runtime dependency. It documents **that package's**
surface (guards, combinators, parsers, and the shape DSL), not anything sourced
in this repo; it is kept here for the same reason.

[`emitter.md`](emitter.md) is a byte-identical mirror of the guide for
`@orkestrel/emitter` — a runtime dependency. It documents **that package's**
surface (the typed push-observation `Emitter`), not anything sourced in this
repo; it is kept here for the same reason.

[`qualifier.md`](qualifier.md) is a byte-identical mirror of the guide for
`@orkestrel/qualifier` — a runtime dependency. It documents **that package's**
surface (pre-rating eligibility, rulings, findings, and scoped qualification),
not anything sourced in this repo; it is kept here so a reader of this package
can see the qualification engine every program delegates to without leaving this
guide set.

[`rater.md`](rater.md) is a byte-identical mirror of the guide for
`@orkestrel/rater` — a runtime dependency. It documents **that package's**
surface (quantitative line rating, amounts, worksheets, and totals), not
anything sourced in this repo; it is kept here so a reader of this package can
see the rating engine every program delegates to without leaving this guide set.

[`guide.md`](guide.md) is a byte-identical mirror of the guide for
`@orkestrel/guide` — the devDependency powering this repo's guides-parity test
suite (`tests/guides.test.ts`). It documents **that package's**
surface (`Guide` / `Source`, the manifest and comparison helpers), not anything
sourced in this repo; it is kept here so a reader of the parity suite can see
the primitives it is built from without leaving this guide set.

## See also

- [`AGENTS.md`](../AGENTS.md) — the rules.
