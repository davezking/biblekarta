// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { spanOf } from '../../lib/core/dates';
import type { DateValue } from '../../lib/core/schema';
import { createT } from '../../lib/i18n';
import Chart from '../chart/Chart';
import type { ChartData } from '../chart/data/useChartData';
import { seedChartData } from '../chart/seed-data.testutil';
import { createChartStore } from '../chart/state';
import { cleanup, click, key, render } from '../ui/ui.testutil';
import DetailPanel, { resolveSelection, type DetailItem } from './DetailPanel';

const am = createT('am');
let data: ChartData;

beforeAll(async () => {
  data = await seedChartData();
});
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubDesktop(desktop: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('min-width: 1024px') ? desktop : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

async function mountChart(desktop = true) {
  stubDesktop(desktop);
  const store = createChartStore();
  const r = await render(<Chart data={data} store={store} />);
  const svg = r.container.querySelector<SVGSVGElement>('svg.chart-svg')!;
  return { ...r, store, svg };
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const rows = (root: ParentNode) =>
  [...root.querySelectorAll('.date-row')].map((r) => ({
    axis: r.getAttribute('data-axis'),
    text: r.querySelector('.date-row-text')!.textContent!,
    chip: r.querySelector('.ui-chip')?.textContent ?? null,
  }));

async function tapAhab(svg: SVGSVGElement) {
  const hit = svg.querySelector('rect.reign-hit[data-reign="ahab"]')!;
  expect(hit).not.toBeNull();
  await act(async () => hit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('tapping Ahab (demo step 5)', () => {
  it('opens a side panel at ≥ 1024 px with both dates, a chip and the How-known text', async () => {
    const { svg, store } = await mountChart(true);
    await tapAhab(svg);
    expect(store.getSnapshot().selection).toEqual({ kind: 'reign', id: 'ahab' });
    const d = dialog()!;
    expect(d.dataset.layout).toBe('side');
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)!.textContent).toBe('አክዓብ');
    expect(d.querySelector('.detail-name-en')!.textContent).toBe('Ahab');

    const figure = d.querySelector('svg.figure')!;
    expect(figure.getAttribute('aria-hidden')).toBe('true');

    expect(rows(d)).toEqual([
      { axis: 'scholarly', text: '874–853 ዓ.ዓ.', chip: am('certainty.exact') },
      { axis: 'traditional', text: am('date.tbd'), chip: am('certainty.tradition_only') },
    ]);

    const how = d.querySelector<HTMLButtonElement>('.how-known button')!;
    expect(how.textContent).toContain('እንዴት ታወቀ?');
    await click(how);
    const text = d.querySelector('.how-known-list')!.textContent!;
    expect(text).toContain('ቃርቃር ጦርነት');
    expect(text).toContain('Kurkh Monolith');
    expect(text).toContain('853 ዓ.ዓ.');

    // The side panel sits below the toolbar.
    const slot = d.closest<HTMLElement>('.panel-slot')!;
    expect(slot.style.getPropertyValue('--panel-inset-top')).toMatch(/^\d+px$/);
  });

  it('opens a bottom sheet below 1024 px with the same content', async () => {
    const { svg } = await mountChart(false);
    await tapAhab(svg);
    const d = dialog()!;
    expect(d.dataset.layout).toBe('sheet');
    expect(rows(d)[0]!.text).toBe('874–853 ዓ.ዓ.');
    expect(d.querySelector('.how-known')).not.toBeNull();
  });
});

describe('closing', () => {
  for (const [how, close] of [
    ['the close button', async () => click(dialog()!.querySelector('.panel-close')!)],
    ['Esc', async () => key(dialog()!, 'Escape')],
  ] as const) {
    it(`${how} clears the selection and returns focus to the chart`, async () => {
      const { svg, store } = await mountChart(true);
      await tapAhab(svg);
      expect(dialog()).not.toBeNull();
      await close();
      expect(store.getSnapshot().selection).toBeNull();
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(svg);
      expect(svg.getAttribute('tabindex')).toBe('-1');
    });
  }

  it('a tap on empty chart space closes it too', async () => {
    const { svg, store } = await mountChart(true);
    await tapAhab(svg);
    await act(async () => svg.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(store.getSnapshot().selection).toBeNull();
    expect(dialog()).toBeNull();
  });
});

describe('every seed person and event', () => {
  const isRelativeOnly = (dvs: (DateValue | undefined)[]) =>
    dvs.some(Boolean) && dvs.every((dv) => !dv || spanOf(dv) === null);

  it('shows both date rows, and no year for a relative date', async () => {
    const items: DetailItem[] = [
      ...data.tile.people.map((p) => resolveSelection({ kind: 'person', id: p.id }, data.tile)!),
      ...data.tile.events.map((e) => resolveSelection({ kind: 'event', id: e.id }, data.tile)!),
    ];
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      const { container } = await render(
        <DetailPanel item={item} tile={data.tile} index={data.index} t={am} />,
      );
      const blocks = [...container.querySelectorAll('.date-block')];
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(rows(block).map((r) => r.axis)).toEqual(['scholarly', 'traditional']);
      }
      // Where every value behind a row is relative, the row shows no digits (no year).
      const pairs =
        item.kind === 'event'
          ? [[item.event.date_scholarly], [item.event.date_traditional]]
          : item.reigns.flatMap((r) => [
              [r.start_scholarly, r.end_scholarly],
              [r.start_traditional, r.end_traditional],
            ]);
      const shown = blocks.flatMap((b) => rows(b));
      pairs.forEach((dvs, i) => {
        if (isRelativeOnly(dvs))
          expect(shown[i]!.text, `${JSON.stringify(dvs)}`).not.toMatch(/[0-9]/);
      });
      cleanup();
    }
  });
});

describe('resolveSelection', () => {
  it('resolves a reign to its person, and an unknown id to null', () => {
    const item = resolveSelection({ kind: 'reign', id: 'ahab' }, data.tile)!;
    expect(item.kind).toBe('person');
    expect(item.kind === 'person' && item.person.id).toBe('ahab');
    expect(item.kind === 'person' && item.selectedReignId).toBe('ahab');
    expect(resolveSelection({ kind: 'person', id: 'nobody' }, data.tile)).toBeNull();
    expect(resolveSelection({ kind: 'event', id: 'battle-of-qarqar' }, data.tile)!.kind).toBe(
      'event',
    );
  });

  it('shows an event: title, English title, summary, dates and refs', async () => {
    const item = resolveSelection({ kind: 'event', id: 'battle-of-qarqar' }, data.tile)!;
    const { container } = await render(
      <DetailPanel item={item} tile={data.tile} index={data.index} t={am} />,
    );
    expect(container.querySelector('.detail-name-en')!.textContent).toBe('Battle of Qarqar');
    expect(container.querySelector('.detail-summary')).not.toBeNull();
    expect(container.querySelector('svg.figure')).toBeNull();
    expect(rows(container)[0]!.text).toBe('853 ዓ.ዓ.');
  });
});
