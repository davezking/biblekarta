// Test helper (not shipped): the seed's compiled index and Divided Kingdom tile, built with the
// real compiler into a temporary folder.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileData } from '../../build/compile-data';
import type { ChartData } from './data/useChartData';

let cached: Promise<ChartData> | undefined;

export function seedChartData(): Promise<ChartData> {
  cached ??= (async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'bk-chart-'));
    const { index, tiles } = await compileData({
      contentDir: 'content',
      seedDir: 'seed',
      outDir,
      env: { BK_SEED: '1' },
      logger: { info: () => {}, warn: () => {} },
      buildId: 'test',
      scriptureBooks: [],
    });
    return { index, tile: tiles['divided-kingdom']! };
  })();
  return cached;
}
