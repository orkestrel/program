import type { FieldPath, JSONValue } from '@orkestrel/contract'
import type { Eligibility, QualificationResult, QualifierInterface } from '@orkestrel/qualifier'
import type { LineDefinition, RatingResult } from '@orkestrel/rater'
import type {
	EvaluatorInterface,
	LogicalDefinition,
	LogicalResult,
	ReasonInterface,
	Subject,
} from '@orkestrel/reason'
import type {
	AggregateGroup,
	AggregateProjection,
	AggregateResult,
	Decision,
	Determination,
	Notice,
	ProgramDefinition,
	ProgramResult,
	ProgramValidationResult,
	Status,
	Tally,
} from './types.js'
import { isFiniteNumber, isRecord, resolveField } from '@orkestrel/contract'
import { findRule, interpolateMessage, logicalPremises } from '@orkestrel/qualifier'
import { isRatingDefinition } from '@orkestrel/rater'
import { formatField } from '@orkestrel/reason'
import {
	AGGREGATE_KEY,
	ELIGIBILITY_DECISIONS,
	OUTCOME_KEY,
	STATUS_PRECEDENCE,
} from './constants.js'
import { ProgramError } from './errors.js'
import { isProgramDefinition } from './validators.js'

/**
 * Return a fresh JSON value tree that does not alias the input.
 *
 * @param value - The JSON value to copy
 * @returns A fresh JSON value
 */
export function copyJSONValue(value: JSONValue): JSONValue {
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(copyJSONValue)
	const copy: Record<string, JSONValue> = {}
	for (const [key, entry] of Object.entries(value)) {
		Object.defineProperty(copy, key, {
			value: copyJSONValue(entry),
			enumerable: true,
			writable: true,
			configurable: true,
		})
	}
	return copy
}

/**
 * Determine whether a caller subject already carries a reserved program key.
 *
 * @remarks
 * `aggregate` and `outcome` are program-private working-subject namespaces — the
 * batch aggregate projection and the authority outcome projection are written
 * under them. A caller subject that already owns either key would silently
 * collide with a projection, so it is rejected before qualification.
 *
 * @param subject - The caller subject to check
 * @returns `true` when the subject owns `aggregate` or `outcome`
 *
 * @example
 * ```ts
 * import { hasReservedKey } from '@orkestrel/program'
 *
 * hasReservedKey({ id: 'r1' }) // false
 * hasReservedKey({ id: 'r1', aggregate: {} }) // true
 * ```
 */
export function hasReservedKey(subject: Readonly<Record<string, unknown>>): boolean {
	return Object.hasOwn(subject, AGGREGATE_KEY) || Object.hasOwn(subject, OUTCOME_KEY)
}

/**
 * Assert a value is a valid program {@link Subject}, narrowing it in place.
 *
 * @param subject - The candidate subject to validate
 * @throws {@link ProgramError} `'MISMATCH'` when the value is not a record, or
 * `'RESERVED'` when it already carries the `aggregate` or `outcome` key
 */
export function assertProgramSubject(subject: unknown): asserts subject is Subject {
	if (!isRecord(subject)) {
		throw new ProgramError('MISMATCH', 'Program subject must be a record')
	}
	if (hasReservedKey(subject)) {
		const key = Object.hasOwn(subject, AGGREGATE_KEY) ? AGGREGATE_KEY : OUTCOME_KEY
		throw new ProgramError('RESERVED', `Subject contains a reserved program key '${key}'`, key)
	}
}

/**
 * Select the rating lines a subject may be rated on from scoped eligibility.
 *
 * @remarks
 * A scope names a rating-line id. A line survives when its scope is absent
 * (eligible by default), `eligible`, or a `condition` (which is not an
 * eligibility value and never appears here). A scoped `ineligible` or `referral`
 * removes the line BEFORE the rater is invoked — the excluded line is never
 * evaluated merely to discard its amount.
 *
 * @param lines - The program's authored rating lines
 * @param scopes - The qualification's per-scope eligibility
 * @returns The surviving line definitions, in authored order
 *
 * @example
 * ```ts
 * import { selectProgramLines } from '@orkestrel/program'
 *
 * selectProgramLines(lines, { wind: 'ineligible' }) // every line except 'wind'
 * ```
 */
export function selectProgramLines(
	lines: readonly LineDefinition[],
	scopes: Readonly<Record<string, Eligibility>>,
): readonly LineDefinition[] {
	return lines.filter((line) => {
		const eligibility = scopes[line.id]
		return eligibility !== 'ineligible' && eligibility !== 'referral'
	})
}

/**
 * Derive the final program {@link Status} from qualification and rating evidence.
 *
 * @remarks
 * Explicit policy, not an opaque precedence reduce (AGENTS §10): global
 * ineligibility or referral is terminal; a scoped referral yields `referral`; a
 * subject with no successful rating is `unrated`; an applied `condition` or an
 * applied scoped `restriction` (a line was removed but others rated) is
 * `conditional`; otherwise `eligible`.
 *
 * @param qualification - The subject's qualification result
 * @param rating - The subject's rating result, when rating occurred
 * @returns The derived status
 */
export function deriveStatus(qualification: QualificationResult, rating?: RatingResult): Status {
	if (qualification.eligibility === 'ineligible') return 'ineligible'
	if (qualification.eligibility === 'referral') return 'referral'
	if (Object.values(qualification.scopes).includes('referral')) return 'referral'
	if (rating === undefined || rating.lines.length === 0) return 'unrated'
	if (!rating.success) return 'unrated'
	const conditional = qualification.findings.some(
		(finding) =>
			finding.applied &&
			(finding.effect === 'condition' ||
				(finding.scope !== undefined && finding.effect === 'restriction')),
	)
	return conditional ? 'conditional' : 'eligible'
}

/**
 * Map a global {@link Eligibility} to its deterministic authority {@link Decision}.
 *
 * @param eligibility - The global eligibility
 * @returns The matching decision
 *
 * @example
 * ```ts
 * import { decideEligibility } from '@orkestrel/program'
 *
 * decideEligibility('eligible') // 'approved'
 * decideEligibility('referral') // 'submitted'
 * ```
 */
export function decideEligibility(eligibility: Eligibility): Decision {
	return ELIGIBILITY_DECISIONS[eligibility]
}

/**
 * Resolve authored {@link Notice}s into unconditionally-applied `notice`
 * {@link Determination}s.
 *
 * @remarks
 * Notices are program output only — they never affect eligibility, status, line
 * selection, or the decision. Each message interpolates against the original
 * subject.
 *
 * @param notices - The authored notices
 * @param subject - The original subject notices interpolate against
 * @returns A fresh list of notice determinations
 */
export function buildNotices(
	notices: readonly Notice[],
	subject: Readonly<Record<string, unknown>>,
): readonly Determination[] {
	return notices.map((notice) => ({
		id: notice.id,
		effect: 'notice',
		applied: true,
		...(notice.scope === undefined ? {} : { scope: notice.scope }),
		message: interpolateMessage(notice.message, subject),
		premises: [],
	}))
}

/**
 * Convert a logical result's applied rules into `limit` {@link Determination}s.
 *
 * @remarks
 * Fires for both the per-subject authority and the batch aggregate gates — both
 * are plain {@link LogicalDefinition}s with no program-authored ruling map, so a
 * fired rule's own `description` (from `@orkestrel/reason`) is the message
 * template, interpolated against the working record the definition ran against.
 * Rich premises reuse the qualifier's {@link logicalPremises}. A rule that never
 * fires produces no determination — program has no authored ruling map to keep
 * evidence for.
 *
 * @param definition - The authority or aggregate-gate logical definition
 * @param result - The evaluated logical result
 * @param working - The working record the definition ran against
 * @param evaluator - The shared reason check evaluator
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh list of `limit` determinations
 */
export function buildLimits(
	definition: LogicalDefinition,
	result: LogicalResult,
	working: Readonly<Record<string, unknown>>,
	evaluator: EvaluatorInterface,
	labels?: Readonly<Record<string, string>>,
): readonly Determination[] {
	const output: Determination[] = []
	for (const entry of result.rules) {
		if (!entry.applied) continue
		const rule = findRule(definition, entry.id)
		if (rule === undefined) continue
		output.push({
			id: entry.id,
			effect: 'limit',
			applied: true,
			...(rule.description === undefined
				? {}
				: { message: interpolateMessage(rule.description, working) }),
			premises: logicalPremises(rule, working, evaluator, labels),
		})
	}
	return output
}

/**
 * Build the private authority outcome projection from an assembled program result.
 *
 * @remarks
 * The authority reads this record under {@link OUTCOME_KEY}; it never receives
 * the mutable internal state of either sibling engine. `total` is carried from
 * the nested rating result when rating occurred.
 *
 * @param result - The preliminary program result computed before authority runs
 * @returns A record shaped for the authority's `outcome` projection
 */
export function buildOutcomeProjection(result: ProgramResult): Readonly<Record<string, unknown>> {
	const total = result.rating?.total
	return {
		id: result.id,
		eligibility: result.eligibility,
		status: result.status,
		rated: result.rating !== undefined,
		...(total === undefined ? {} : { total }),
		scopes: { ...result.qualification.scopes },
	}
}

/**
 * Assemble a {@link ProgramResult} from its qualification, rating, and
 * determination parts — before or after authority.
 *
 * @remarks
 * `eligibility` mirrors the qualification. `success` is execution integrity: the
 * qualification succeeded, rating (when it ran) succeeded, and authority (when it
 * ran) produced no errors — a valid ineligible or referral outcome still
 * succeeds. `trace` and `errors` accumulate the qualification's, every rated
 * line's worksheet trail, and the authority's. A `decision` is present ONLY when
 * an authority ran (`options.authority`), it produced no errors, no `limit`
 * determination applied, and status is not `unrated`.
 *
 * @param definition - The authored program definition
 * @param qualification - The subject's qualification result
 * @param rating - The subject's rating result, when rating occurred
 * @param determinations - The program-scoped determinations (notices, then limits)
 * @param status - The already-derived status
 * @param options - Optional authority result driving the decision projection
 * @returns A fresh program result
 */
export function buildProgramResult(
	definition: ProgramDefinition,
	qualification: QualificationResult,
	rating: RatingResult | undefined,
	determinations: readonly Determination[],
	status: Status,
	options?: { readonly authority?: LogicalResult },
): ProgramResult {
	const authority = options?.authority
	const ratingTrace =
		rating === undefined ? [] : rating.lines.flatMap((line) => line.worksheet.trace)
	const ratingErrors =
		rating === undefined ? [] : rating.lines.flatMap((line) => line.worksheet.errors)
	const authorityTrace = authority === undefined ? [] : [...authority.trace]
	const authorityErrors = authority === undefined ? [] : [...authority.errors]
	const trace = [...qualification.trace, ...ratingTrace, ...authorityTrace]
	const errors = [...qualification.errors, ...ratingErrors, ...authorityErrors]
	const success =
		qualification.success &&
		(rating === undefined || rating.success) &&
		authorityErrors.length === 0
	const limited = determinations.some((entry) => entry.effect === 'limit' && entry.applied)
	const decision =
		authority !== undefined && authorityErrors.length === 0 && !limited && status !== 'unrated'
			? decideEligibility(qualification.eligibility)
			: undefined
	return {
		id: definition.id,
		name: definition.name,
		eligibility: qualification.eligibility,
		status,
		...(decision === undefined ? {} : { decision }),
		qualification,
		...(rating === undefined ? {} : { rating }),
		determinations,
		success,
		trace,
		errors,
	}
}

/**
 * Add optional aggregate context to a private subject copy for qualification.
 *
 * @remarks
 * The original subject is returned unchanged when no aggregate context exists.
 * When context exists the helper creates a private copy under {@link AGGREGATE_KEY}
 * and defensively copies every nested record — the rater still receives the
 * original subject, never this copy.
 *
 * @param subject - The original caller subject
 * @param aggregate - The subject's aggregate projection, when a batch supplies one
 * @returns The subject, or a private copy carrying the aggregate projection
 */
export function buildQualificationSubject(
	subject: Subject,
	aggregate?: AggregateProjection,
): Subject {
	if (aggregate === undefined) return subject
	return {
		...subject,
		[AGGREGATE_KEY]: {
			count: aggregate.count,
			sums: { ...aggregate.sums },
			...(aggregate.group === undefined
				? {}
				: {
						group: {
							key: aggregate.group.key,
							count: aggregate.group.count,
							sums: { ...aggregate.group.sums },
						},
					}),
		},
	}
}

/**
 * Return authored scopes (qualification ruling scopes or notice scopes) that
 * name no rating line on the program.
 *
 * @remarks
 * A scope is an opaque string to the qualifier — program alone matches it to a
 * rating-line id. A scope naming no line is a hard authoring error surfaced as
 * {@link ProgramError} `'MISSING'` at construction, regardless of the validate
 * option.
 *
 * @param definition - The program definition to check
 * @returns A fresh, deduped list of missing scope references
 */
export function findMissingScopes(definition: ProgramDefinition): readonly string[] {
	const ids = new Set(definition.rating.lines.map((line) => line.id))
	const missing = new Set<string>()
	for (const ruling of definition.qualification.rulings ?? []) {
		if (ruling.scope !== undefined && !ids.has(ruling.scope)) missing.add(ruling.scope)
	}
	for (const notice of definition.notices ?? []) {
		if (notice.scope !== undefined && !ids.has(notice.scope)) missing.add(notice.scope)
	}
	return [...missing]
}

/**
 * Validate a program definition's shape, references, and nested definitions.
 *
 * @remarks
 * The single semantic-validation implementation used by `Program.validate`. It
 * establishes exact shape through {@link isProgramDefinition}, validates the
 * rating structurally through the rater's {@link isRatingDefinition} guard (the
 * rater exposes no `validate`), delegates qualification validation to the
 * injected qualifier and authority / aggregate-gate validation to the shared
 * reason engine, and checks scope, notice, and aggregate-field references here.
 *
 * @param definition - The program definition to validate
 * @param qualifier - The qualifier that validates the nested qualification
 * @param engine - The reason engine that validates authority and aggregate gates
 * @returns A structured validation result
 */
export function validateProgramDefinition(
	definition: ProgramDefinition,
	qualifier: QualifierInterface,
	engine: ReasonInterface,
): ProgramValidationResult {
	if (!isProgramDefinition(definition)) {
		return { valid: false, errors: ['Program definition has an invalid shape'], warnings: [] }
	}

	const errors: string[] = []
	const warnings: string[] = []

	if (definition.id.length === 0) errors.push('Program id must not be empty')
	if (definition.name.length === 0) errors.push('Program name must not be empty')

	if (!isRatingDefinition(definition.rating)) {
		errors.push('rating: definition has an invalid shape')
	}

	const qualification = qualifier.validate(definition.qualification)
	errors.push(...qualification.errors.map((error) => `qualification: ${error}`))
	warnings.push(...qualification.warnings.map((warning) => `qualification: ${warning}`))

	const lines = new Set(definition.rating.lines.map((line) => line.id))
	if (lines.size !== definition.rating.lines.length) errors.push('rating: duplicate line id')
	for (const ruling of definition.qualification.rulings ?? []) {
		if (ruling.scope !== undefined && !lines.has(ruling.scope)) {
			errors.push(`Qualification ruling "${ruling.id}" references missing line "${ruling.scope}"`)
		}
	}

	const notices = new Set<string>()
	for (const notice of definition.notices ?? []) {
		if (notices.has(notice.id)) errors.push(`Duplicate notice id "${notice.id}"`)
		notices.add(notice.id)
		if (notice.scope !== undefined && !lines.has(notice.scope)) {
			errors.push(`Notice "${notice.id}" references missing line "${notice.scope}"`)
		}
	}

	const authority = definition.authority
	if (authority !== undefined) {
		if (authority.reasoning !== 'logical') {
			errors.push('Authority must be a logical definition')
		} else {
			const validation = engine.validate(authority)
			errors.push(...validation.errors.map((error) => `authority: ${error}`))
			warnings.push(...validation.warnings.map((warning) => `authority: ${warning}`))
		}
	}

	const aggregate = definition.aggregate
	if (aggregate !== undefined) {
		const fields = new Set<string>()
		for (const field of aggregate.fields) {
			const key = formatField(field)
			if (key.length === 0) errors.push('Aggregate fields must be non-empty')
			if (fields.has(key)) errors.push(`Duplicate aggregate field "${key}"`)
			fields.add(key)
		}
		if (aggregate.by !== undefined && formatField(aggregate.by).length === 0) {
			errors.push('Aggregate partition field must be non-empty')
		}
		if (aggregate.gates !== undefined) {
			if (aggregate.gates.reasoning !== 'logical') {
				errors.push('Aggregate gates must be a logical definition')
			} else {
				const validation = engine.validate(aggregate.gates)
				errors.push(...validation.errors.map((error) => `aggregate: ${error}`))
				warnings.push(...validation.warnings.map((warning) => `aggregate: ${warning}`))
			}
			if (aggregate.fields.length === 0) {
				warnings.push('Aggregate gates are defined without aggregate fields')
			}
		}
	}

	if (definition.rating.lines.length === 0) warnings.push('Program rating has no lines')

	return { valid: errors.length === 0, errors, warnings }
}

/**
 * Sum aggregate fields across a batch of subjects.
 *
 * @remarks
 * A {@link FieldPath} may be nested — a nested path sums a nested subject field
 * exactly like a top-level one, and `formatField` renders the dot-joined key the
 * returned record is keyed by. Only finite numbers contribute; a non-numeric or
 * absent value contributes zero (never a coercion).
 *
 * @param subjects - The batch of subjects
 * @param fields - The fields to sum
 * @returns A fresh record of dot-joined field to summed finite value
 */
export function aggregateSums(
	subjects: readonly Subject[],
	fields: readonly FieldPath[],
): Readonly<Record<string, number>> {
	const sums: Record<string, number> = {}
	for (const field of fields) sums[formatField(field)] = 0
	for (const subject of subjects) {
		for (const field of fields) {
			const key = formatField(field)
			const value = resolveField(subject, field)
			if (isFiniteNumber(value)) sums[key] = (sums[key] ?? 0) + value
		}
	}
	return sums
}

/**
 * Partition a batch of subjects by a field, summing aggregate fields per key.
 *
 * @remarks
 * The partition key is the resolved `by` field coerced with `String` —
 * `undefined` collapses to the empty string, so a subject missing the field and
 * a subject whose field is literally `''` land in the SAME partition, and a
 * numeric `1` collides with the string `'1'`. Group order follows first
 * appearance in the subject array.
 *
 * @param subjects - The batch of subjects
 * @param fields - The fields to sum within each partition
 * @param by - The partition key field; no partition is built when absent
 * @returns A fresh list of aggregate groups, or an empty list when `by` is absent
 */
export function aggregateGroups(
	subjects: readonly Subject[],
	fields: readonly FieldPath[],
	by?: FieldPath,
): readonly AggregateGroup[] {
	if (by === undefined) return []
	const records = new Map<string, Subject[]>()
	for (const subject of subjects) {
		const key = String(resolveField(subject, by) ?? '')
		const group = records.get(key)
		if (group === undefined) records.set(key, [subject])
		else group.push(subject)
	}
	return [...records.entries()].map(([key, entries]) => ({
		key,
		count: entries.length,
		sums: aggregateSums(entries, fields),
	}))
}

/**
 * Build one subject's overall and optional group aggregate projection.
 *
 * @remarks
 * The projection carries the whole-batch `count` and `sums` plus the subject's
 * OWN partition, located by the same `String`-coerced key {@link aggregateGroups}
 * partitions under.
 *
 * @param subject - The subject to project for
 * @param count - The whole-batch subject count
 * @param sums - The whole-batch summed aggregate fields
 * @param groups - The batch partitions
 * @param by - The partition key field; no group is attached when absent
 * @returns A fresh aggregate projection
 */
export function buildAggregateProjection(
	subject: Subject,
	count: number,
	sums: Readonly<Record<string, number>>,
	groups: readonly AggregateGroup[],
	by?: FieldPath,
): AggregateProjection {
	const group =
		by === undefined
			? undefined
			: groups.find((entry) => entry.key === String(resolveField(subject, by) ?? ''))
	return { count, sums: { ...sums }, ...(group === undefined ? {} : { group }) }
}

/**
 * Build the reserved-key record a batch aggregate-gate definition runs against.
 *
 * @remarks
 * Unlike a per-subject {@link buildAggregateProjection}, the batch record carries
 * every `group` (a `groups` array) under {@link AGGREGATE_KEY} so a gate rule can
 * read `aggregate.sums.<field>` (overall) or a partition inside `aggregate.groups`.
 *
 * @param count - The whole-batch subject count
 * @param sums - The whole-batch summed aggregate fields
 * @param groups - The batch partitions
 * @returns A fresh record carrying the batch aggregate under {@link AGGREGATE_KEY}
 */
export function buildAggregateRecord(
	count: number,
	sums: Readonly<Record<string, number>>,
	groups: readonly AggregateGroup[],
): Readonly<Record<string, unknown>> {
	return { [AGGREGATE_KEY]: { count, sums, groups } }
}

/**
 * Build a zero-sum record for a set of aggregate fields.
 *
 * @param fields - The fields to zero
 * @returns A fresh record of dot-joined field to `0`
 */
export function emptySums(fields: readonly FieldPath[]): Readonly<Record<string, number>> {
	const sums: Record<string, number> = {}
	for (const field of fields) sums[formatField(field)] = 0
	return sums
}

/**
 * Complete a partial status tally record with zero entries for every missing
 * {@link Status}.
 *
 * @param entries - The partial tally entries to complete
 * @returns A record with all five statuses present
 */
export function completeTallies(
	entries: Partial<Record<Status, Tally>>,
): Readonly<Record<Status, Tally>> {
	return {
		ineligible: entries.ineligible ?? { count: 0, sums: {} },
		referral: entries.referral ?? { count: 0, sums: {} },
		conditional: entries.conditional ?? { count: 0, sums: {} },
		unrated: entries.unrated ?? { count: 0, sums: {} },
		eligible: entries.eligible ?? { count: 0, sums: {} },
	}
}

/**
 * Build complete zero status tallies in {@link STATUS_PRECEDENCE} order.
 *
 * @param fields - The fields each tally's sums are zeroed for
 * @returns A fresh, complete tally record
 */
export function emptyTallies(fields: readonly FieldPath[]): Readonly<Record<Status, Tally>> {
	const entries: Partial<Record<Status, Tally>> = {}
	for (const status of STATUS_PRECEDENCE) entries[status] = { count: 0, sums: emptySums(fields) }
	return completeTallies(entries)
}

/**
 * Add one subject's aggregate contribution to a status tally record.
 *
 * @param tallies - The tallies to update
 * @param result - The subject's program result (its `status` selects the tally)
 * @param subject - The subject to fold in
 * @param fields - The fields to sum
 * @returns A fresh, complete tally record with the subject folded in
 */
export function tallyProgram(
	tallies: Readonly<Record<Status, Tally>>,
	result: ProgramResult,
	subject: Subject,
	fields: readonly FieldPath[],
): Readonly<Record<Status, Tally>> {
	const status = result.status
	const current = tallies[status]
	const sums: Record<string, number> = { ...current.sums }
	for (const field of fields) {
		const key = formatField(field)
		const value = resolveField(subject, field)
		if (isFiniteNumber(value)) sums[key] = (sums[key] ?? 0) + value
	}
	return completeTallies({ ...tallies, [status]: { count: current.count + 1, sums } })
}

/**
 * Assemble one batch {@link AggregateResult} from its per-subject and aggregate
 * parts.
 *
 * @remarks
 * `count` is the subject count, `success` requires every subject execution to
 * succeed, and `trace` / `errors` accumulate every subject's. A fired aggregate
 * gate contributes a `limit` determination, never a technical failure (a
 * non-logical gate result is a caller-facing `MISMATCH` thrown by `Program`
 * before this assembles).
 *
 * @param definition - The authored program definition
 * @param subjects - The per-subject program results, in input order
 * @param determinations - The batch aggregate-gate `limit` determinations
 * @param groups - The batch partitions
 * @param tallies - The completed status tallies
 * @param sums - The whole-batch summed aggregate fields
 * @returns A fresh aggregate result
 */
export function buildAggregateResult(
	definition: ProgramDefinition,
	subjects: readonly ProgramResult[],
	determinations: readonly Determination[],
	groups: readonly AggregateGroup[],
	tallies: Readonly<Record<Status, Tally>>,
	sums: Readonly<Record<string, number>>,
): AggregateResult {
	return {
		id: definition.id,
		name: definition.name,
		subjects,
		determinations,
		groups,
		tallies,
		count: subjects.length,
		sums,
		success: subjects.every((entry) => entry.success),
		trace: subjects.flatMap((entry) => entry.trace),
		errors: subjects.flatMap((entry) => entry.errors),
	}
}
