// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { Anchor, DateValue } from '../../lib/core/schema';
import { createT } from '../../lib/i18n';
import { cleanup, render } from '../ui/ui.testutil';
import DateRow, { DateBlock, certaintyOf, dateText, type Certainty } from './DateRow';

afterEach(cleanup);

const am = createT('am');
const en = createT('en');
const ANCHOR: Anchor = {
  id: 'a1',
  label_am: 'መነሻ',
  label_en: 'Anchor',
  date: { start: -852 },
  external_source: 'Stele',
  confidence: 'high',
  canon: 'shared',
};
const anchors = new Map([[ANCHOR.id, ANCHOR]]);

const METHODS = ['anchor', 'derived', 'traditional', 'relative'] as const;
const CERTAINTIES: Certainty[] = ['exact', 'approximate', 'range', 'disputed', 'tradition_only'];

/** A valid DateValue for each method (schema.ts rules). */
function dv(method: DateValue['method'], certainty: Certainty): DateValue {
  switch (method) {
    case 'anchor':
      return { start: -852, certainty, method, anchor_id: 'a1' };
    case 'derived':
      return {
        start: -873,
        end: -852,
        certainty,
        method,
        anchor_id: 'a1',
        anchor_value_used: -852,
      };
    case 'traditional':
      return { start: 3388, certainty, method, source_id: 's1' };
    case 'relative':
      return { certainty, method, relative_text_am: 'ከሰሎሞን በኋላ' };
  }
}

async function row(props: Parameters<typeof DateRow>[0]) {
  const { container } = await render(
    <dl>
      <DateRow {...props} />
    </dl>,
  );
  const el = container.querySelector('.date-row')!;
  return {
    el,
    axis: el.querySelector('dt')!.textContent,
    text: el.querySelector('.date-row-text')!.textContent!,
    chip: el.querySelector('.ui-chip'),
    stale: el.querySelector('.date-row-stale'),
  };
}

describe('dateText', () => {
  it("formats Ahab's reign as one span: 874–853 ዓ.ዓ.", () => {
    const start: DateValue = {
      start: -873,
      certainty: 'exact',
      method: 'derived',
      anchor_id: 'a1',
      anchor_value_used: -852,
    };
    const end: DateValue = { ...start, start: -852 };
    expect(dateText('scholarly', am, start, end)).toBe('874–853 ዓ.ዓ.');
    expect(dateText('scholarly', en, start, end)).toBe('874–853 BC');
  });

  it('shows TBD with no date, and the relative text (never a year) for relative dates', () => {
    expect(dateText('traditional', am)).toBe('ያልተወሰነ');
    const tbd: DateValue = {
      certainty: 'tradition_only',
      method: 'relative',
      relative_text_am: 'TBD',
    };
    expect(dateText('traditional', am, tbd, tbd)).toBe('ያልተወሰነ');
    expect(dateText('traditional', en, tbd, { ...tbd })).toBe('TBD');
    const rel = dv('relative', 'approximate');
    expect(dateText('scholarly', am, rel)).toBe('ከሰሎሞን በኋላ');
  });

  it('joins a dated start and an undated end without inventing the end', () => {
    const start: DateValue = { start: -965, certainty: 'approximate', method: 'anchor' };
    const end: DateValue = {
      certainty: 'approximate',
      method: 'relative',
      relative_text_am: 'TBD',
    };
    expect(dateText('scholarly', en, start, end)).toBe('c. 966 BC–TBD');
  });

  it('a span takes the weaker certainty of its ends', () => {
    const a: DateValue = { start: -900, certainty: 'exact', method: 'anchor' };
    const b: DateValue = { start: -880, certainty: 'disputed', method: 'anchor' };
    expect(certaintyOf(a, b)).toBe('disputed');
    expect(dateText('scholarly', en, a, b)).toBe('901–881 BC (disputed)');
    expect(certaintyOf()).toBeUndefined();
  });
});

describe('DateRow', () => {
  for (const method of METHODS) {
    for (const certainty of CERTAINTIES) {
      for (const axis of ['scholarly', 'traditional'] as const) {
        it(`${axis} · ${method} · ${certainty}`, async () => {
          const value = dv(method, certainty);
          const r = await row({ axis, start: value, anchors, t: am });
          expect(r.el.getAttribute('data-axis')).toBe(axis);
          expect(r.axis).toBe(am(`axis.${axis}.name`));
          expect(r.chip!.textContent).toBe(am(`certainty.${certainty}`));
          if (method === 'relative') {
            expect(r.text).toBe('ከሰሎሞን በኋላ');
            expect(r.text).not.toMatch(/\d/);
          } else {
            expect(r.text).toMatch(/\d/);
          }
          if (certainty === 'approximate' && method !== 'relative')
            expect(r.text).toMatch(/^በግምት /);
          if (certainty === 'disputed' && method !== 'relative')
            expect(r.text).toMatch(/\(አከራካሪ\)$/);
          expect(r.stale).toBeNull();
        });
      }
    }
  }

  it('shows TBD and no chip when there is no date on the axis', async () => {
    const r = await row({ axis: 'traditional', anchors, t: am });
    expect(r.text).toBe('ያልተወሰነ');
    expect(r.chip).toBeNull();
  });

  it('flags a stale derived date (its anchor moved, or is missing) in red ink', async () => {
    const moved: DateValue = { ...dv('derived', 'exact'), anchor_value_used: -853 };
    let r = await row({ axis: 'scholarly', start: moved, anchors, t: en });
    expect(r.stale!.textContent).toBe(en('date.stale'));
    cleanup();
    const orphan: DateValue = { ...dv('derived', 'exact'), anchor_id: 'gone' };
    r = await row({ axis: 'scholarly', start: orphan, anchors, t: en });
    expect(r.stale).not.toBeNull();
    cleanup();
    r = await row({ axis: 'scholarly', start: dv('derived', 'exact'), anchors, t: en });
    expect(r.stale).toBeNull();
  });
});

describe('DateBlock', () => {
  it('always shows both rows, scholarly first, even with nothing dated', async () => {
    const { container } = await render(<DateBlock dates={{}} anchors={anchors} t={am} />);
    const rows = [...container.querySelectorAll('.date-row')];
    expect(rows.map((r) => r.getAttribute('data-axis'))).toEqual(['scholarly', 'traditional']);
    expect(rows.map((r) => r.querySelector('.date-row-text')!.textContent)).toEqual([
      'ያልተወሰነ',
      'ያልተወሰነ',
    ]);
  });
});
