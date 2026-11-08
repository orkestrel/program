Each item is a chunk that reaches green before the next. An item keeps its number for life: a closed
item leaves this file and its number is never reused, so a commit message citing an item by number
stays true.

- **1.** On the user's word, give definition refusals a path and replace the bare exception for an invalid `rating.lines` value with a diagnostic refusal in the definition validation helpers in `src/core/helpers.ts`. Preserve refusal of the malformed value. Owner: the user.
- **2.** After the shared standing-proof observation mechanism lands in `@orkestrel/test`, adopt it for `buildProgramContractCases` in `tests/setup.ts` and `tests/src/core/contracts.test.ts`. Preserve zero-argument projector callbacks, unknown-scope controls, single and batch outcomes, and aggregate behavior locally.
