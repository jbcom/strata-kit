import { describe, expect, it } from 'vitest';

import { applyShaderPatches, replaceOrThrow } from '../src/shaderPatches.ts';

describe('shader patches', () => {
  it('replaces one exact literal anchor without mutating the input source', () => {
    const source = 'before\n#include <common>\nafter';
    const result = replaceOrThrow(source, '#include <common>', '#include <common>\nfloat strata = 1.0;');

    expect(result).toBe('before\n#include <common>\nfloat strata = 1.0;\nafter');
    expect(source).toBe('before\n#include <common>\nafter');
  });

  it('rejects a missing anchor with the anchor in its error', () => {
    expect(() => replaceOrThrow('void main() {}', '#include <common>', 'patched')).toThrow(
      'shader patch anchor is missing: "#include <common>"'
    );
  });

  it('rejects duplicate anchors, including overlapping literal matches', () => {
    expect(() => replaceOrThrow('aaaa', 'aaa', 'patched')).toThrow(
      'shader patch anchor must occur exactly once (found 2): "aaa"'
    );
  });

  it('rejects anchors that are empty or whitespace-only', () => {
    expect(() => replaceOrThrow('source', '', 'patched')).toThrow(
      'shader patch anchor must be a nonempty string'
    );
    expect(() => replaceOrThrow('source', '   ', 'patched')).toThrow(
      'shader patch anchor must be a nonempty string'
    );
    expect(replaceOrThrow('source', 'source', '')).toBe('');
  });

  it('rejects malformed runtime inputs', () => {
    expect(() => replaceOrThrow(null as unknown as string, 'anchor', 'patched')).toThrow(
      'shader patch source must be a string'
    );
    expect(() => replaceOrThrow('source', 'source', null as unknown as string)).toThrow(
      'shader patch replacement must be a string'
    );
    expect(() => applyShaderPatches('source', null as unknown as readonly { anchor: string; replacement: string }[])).toThrow(
      'shader patches must be an array'
    );
  });

  it('permits a non-anchor replacement that is already present elsewhere', () => {
    expect(replaceOrThrow('existing();\n#include <x>', '#include <x>', 'existing();')).toBe(
      'existing();\nexisting();'
    );
  });

  it('rejects a second application when the replacement retains its anchor', () => {
    const anchor = '#include <common>';
    const replacement = '#include <common>\nfloat strata = 1.0;';
    const once = replaceOrThrow('before\n#include <common>\nafter', anchor, replacement);

    expect(() => replaceOrThrow(once, anchor, replacement)).toThrow(
      'shader patch replacement is already present: "#include <common>\\nfloat strata = 1.0;"'
    );
  });

  it('applies valid patches sequentially without mutating the patch list', () => {
    const source = 'START\nFIRST\nSECOND\nEND';
    const patches = [
      { anchor: 'FIRST', replacement: 'FIRST-PATCHED' },
      { anchor: 'SECOND', replacement: 'SECOND-PATCHED' },
    ] as const;
    const originalPatches = structuredClone(patches);

    expect(applyShaderPatches(source, patches)).toBe('START\nFIRST-PATCHED\nSECOND-PATCHED\nEND');
    expect(source).toBe('START\nFIRST\nSECOND\nEND');
    expect(patches).toEqual(originalPatches);
  });

  it('identifies the patch index when an earlier patch consumes a later anchor', () => {
    const source = 'FIRST\nSECOND';
    const patches = [
      { anchor: 'FIRST\nSECOND', replacement: 'PATCHED' },
      { anchor: 'SECOND', replacement: 'SECOND-PATCHED' },
    ] as const;

    expect(() => applyShaderPatches(source, patches)).toThrow(
      'shader patch at index 1 for anchor "SECOND" failed: shader patch anchor is missing: "SECOND"'
    );
    expect(source).toBe('FIRST\nSECOND');
    expect(patches).toEqual([
      { anchor: 'FIRST\nSECOND', replacement: 'PATCHED' },
      { anchor: 'SECOND', replacement: 'SECOND-PATCHED' },
    ]);
  });

  it('uses literal matching rather than treating shader anchors as regular expressions', () => {
    expect(replaceOrThrow('a.b\naXb', 'a.b', 'patched')).toBe('patched\naXb');
  });
});
