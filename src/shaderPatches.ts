function formatAnchor(anchor: unknown): string {
  return typeof anchor === 'string' ? JSON.stringify(anchor) : String(anchor);
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`shader patch ${label} must be a string`);
  }
}

function requireAnchor(anchor: unknown): asserts anchor is string {
  requireString(anchor, 'anchor');
  if (anchor.trim().length === 0) {
    throw new Error('shader patch anchor must be a nonempty string');
  }
}

function countLiteralOccurrences(source: string, anchor: string): number {
  let count = 0;
  let offset = source.indexOf(anchor);

  while (offset !== -1) {
    count += 1;
    // Advance one code unit so overlapping literal matches also invalidate a patch.
    offset = source.indexOf(anchor, offset + 1);
  }

  return count;
}

/**
 * Replaces exactly one literal shader anchor with a supplied source fragment.
 *
 * The helper rejects missing or duplicate anchors. When a replacement retains its
 * anchor, it also rejects a previously inserted copy to prevent double application.
 *
 * @param source - The shader source to transform.
 * @param anchor - A nonempty literal expected exactly once in `source`.
 * @param replacement - The text that replaces the anchor. An empty string removes it.
 * @returns A new shader-source string; `source` is never modified.
 * @throws When inputs are malformed or the patch cannot be applied unambiguously.
 */
export function replaceOrThrow(source: string, anchor: string, replacement: string): string {
  requireString(source, 'source');
  requireAnchor(anchor);
  requireString(replacement, 'replacement');

  const occurrenceCount = countLiteralOccurrences(source, anchor);
  if (occurrenceCount === 0) {
    throw new Error(`shader patch anchor is missing: ${formatAnchor(anchor)}`);
  }
  if (occurrenceCount !== 1) {
    throw new Error(
      `shader patch anchor must occur exactly once (found ${occurrenceCount}): ${formatAnchor(anchor)}`
    );
  }
  // Only anchor-retaining replacements can prove a second application. Other
  // replacements may legitimately occur elsewhere in the shader source.
  if (replacement.includes(anchor) && source.includes(replacement)) {
    throw new Error(`shader patch replacement is already present: ${formatAnchor(replacement)}`);
  }

  const offset = source.indexOf(anchor);
  return `${source.slice(0, offset)}${replacement}${source.slice(offset + anchor.length)}`;
}

/**
 * Applies shader-source replacements in order, passing each output to the next patch.
 *
 * @param source - The initial shader source.
 * @param patches - Immutable patch descriptions applied from index zero upward.
 * @returns The final source after every patch succeeds.
 * @throws With the failing patch index and anchor when a patch is invalid or ambiguous.
 */
export function applyShaderPatches(
  source: string,
  patches: readonly { anchor: string; replacement: string }[]
): string {
  requireString(source, 'source');
  if (!Array.isArray(patches)) {
    throw new Error('shader patches must be an array');
  }

  let result = source;
  for (let index = 0; index < patches.length; index += 1) {
    const patch = patches[index];
    const anchor = patch !== null && typeof patch === 'object' ? patch.anchor : undefined;

    try {
      if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new Error('shader patch must be an object');
      }
      result = replaceOrThrow(result, patch.anchor, patch.replacement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `shader patch at index ${index} for anchor ${formatAnchor(anchor)} failed: ${message}`
      );
    }
  }

  return result;
}
