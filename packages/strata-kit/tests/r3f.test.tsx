import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { StrataHeightfield } from '../src/r3f.tsx';
import { createSeededTerrainField } from '../src/terrain.ts';

describe('StrataHeightfield', () => {
  it('creates a geometry for its supplied mesh and disposes it on unmount', async () => {
    const mesh = createSeededTerrainField({
      seed: 'r3f-lifecycle',
      biomes: [{ type: 'forest', center: [0, 0], radius: 8 }],
    }).createHeightfield({ width: 2, depth: 2, cellSize: 1 });

    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(<StrataHeightfield mesh={mesh} />);
    });
    const geometry = renderer?.root.findByType('mesh').props.geometry;
    const dispose = vi.spyOn(geometry, 'dispose');

    await act(async () => {
      renderer?.unmount();
    });

    expect(dispose).toHaveBeenCalledOnce();
  });
});
