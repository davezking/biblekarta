// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { Anchor, DateValue, Source } from '../../lib/core/schema';
import { createT } from '../../lib/i18n';
import { cleanup, click, render } from '../ui/ui.testutil';
import HowKnown, { explainDate, refText } from './HowKnown';

afterEach(cleanup);

const am = createT('am');
const en = createT('en');
const QARQAR: Anchor = {
  id: 'qarqar-853',
  label_am: 'ቃርቃር ጦርነት',
  label_en: 'Battle of Qarqar',
  date: { start: -852 },
  external_source: 'Kurkh Monolith',
  confidence: 'high',
  canon: 'shared',
};
const anchors = new Map([[QARQAR.id, QARQAR]]);
const SOURCES: Source[] = [
  { id: 'thiele', citation: 'Thiele, Mysterious Numbers', kind: 'scholarly', canon: 'shared' },
  { id: 'trad', citation: 'Test tradition source', kind: 'tradition', canon: 'shared' },
];
const sources = new Map(SOURCES.map((s) => [s.id, s]));

const explain = (dv: DateValue, t = am) => explainDate(dv, t, anchors, sources);

describe('explainDate: one sentence per method', () => {
  it('anchor: names the anchor and its external source', () => {
    const s = explain({
      start: -852,
      certainty: 'exact',
      method: 'anchor',
      anchor_id: 'qarqar-853',
    });
    expect(s).toContain('ቃርቃር ጦርነት');
    expect(s).toContain('Kurkh Monolith');
    expect(
      explain({ start: -852, certainty: 'exact', method: 'anchor', source_id: 'thiele' }),
    ).toContain('Thiele, Mysterious Numbers');
  });

  it('derived: the anchor, the value used, its source, the refs and the calculation source', () => {
    const dv: DateValue = {
      start: -873,
      certainty: 'exact',
      method: 'derived',
      anchor_id: 'qarqar-853',
      anchor_value_used: -852,
      source_id: 'thiele',
      derivation_refs: [{ book_id: '1ki', chapter: 16, verse_start: 29 }],
    };
    const s = explain(dv);
    expect(s).toContain('ቃርቃር ጦርነት');
    expect(s).toContain('853 ዓ.ዓ.');
    expect(s).toContain('Kurkh Monolith');
    expect(s).toContain('1ki ፲፮፥፳፱');
    expect(s).toContain('Thiele, Mysterious Numbers');
    expect(explain(dv, en)).toBe(
      'Calculated from the Battle of Qarqar (853 BC); the Battle of Qarqar is attested by the Kurkh Monolith. Worked out from 1ki ፲፮፥፳፱. Calculation: Thiele, Mysterious Numbers.',
    );
  });

  it('traditional: the source citation', () => {
    expect(
      explain(
        { start: 3388, certainty: 'tradition_only', method: 'traditional', source_id: 'trad' },
        en,
      ),
    ).toBe('Traditional source: Test tradition source.');
  });

  it('relative: the relative text, or "not determined yet" for TBD', () => {
    expect(
      explain({ certainty: 'approximate', method: 'relative', relative_text_am: 'ከሰሎሞን በኋላ' }),
    ).toContain('ከሰሎሞን በኋላ');
    const tbd = explain({
      certainty: 'tradition_only',
      method: 'relative',
      relative_text_am: 'TBD',
    });
    expect(tbd).toBe(am('how.relative.tbd'));
    expect(tbd).not.toContain('TBD');
  });

  it('says so when the anchor or source is missing, instead of guessing', () => {
    expect(explain({ start: 1, certainty: 'exact', method: 'anchor' })).toBe(am('how.missing'));
    expect(
      explain({
        start: 1,
        certainty: 'exact',
        method: 'derived',
        anchor_id: 'gone',
        anchor_value_used: 1,
      }),
    ).toBe(am('how.missing'));
    expect(
      explain({ start: 1, certainty: 'exact', method: 'traditional', source_id: 'gone' }),
    ).toBe(am('how.missing'));
  });
});

describe('refText', () => {
  it('uses the book name when given, else a placeholder with the id', () => {
    const ref = { book_id: '1ki', chapter: 16, verse_start: 29, verse_end: 31 };
    expect(refText(ref)).toBe('1ki ፲፮፥፳፱–፴፩');
    const books = new Map([['1ki', { id: '1ki', name_am: 'መጽሐፍ', abbr_am: 'መጽ' }]]);
    expect(refText(ref, books)).toBe('መጽ ፲፮፥፳፱–፴፩');
  });
});

describe('HowKnown', () => {
  it('is a closed "እንዴት ታወቀ?" disclosure listing one line per distinct explanation', async () => {
    const start: DateValue = {
      start: -873,
      certainty: 'exact',
      method: 'derived',
      anchor_id: 'qarqar-853',
      anchor_value_used: -852,
    };
    const tbd: DateValue = {
      certainty: 'tradition_only',
      method: 'relative',
      relative_text_am: 'TBD',
    };
    const { container } = await render(
      <HowKnown
        dates={[
          { axis: 'scholarly', dv: start },
          { axis: 'scholarly', dv: { ...start, start: -852 } },
          { axis: 'traditional', dv: tbd },
          { axis: 'traditional', dv: tbd },
        ]}
        anchors={anchors}
        sources={sources}
        t={am}
      />,
    );
    const button = container.querySelector('button')!;
    expect(button.textContent).toContain('እንዴት ታወቀ?');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await click(button);
    const items = [...container.querySelectorAll('.how-known-list li')];
    expect(items.map((li) => li.getAttribute('data-axis'))).toEqual(['scholarly', 'traditional']);
    expect(items[0]!.textContent).toMatch(/^ታሪካዊ ምርምር፦ .*ቃርቃር ጦርነት.*Kurkh Monolith/);
    expect(items[1]!.textContent).toBe(`ትውፊታዊ፦ ${am('how.relative.tbd')}`);
  });
});
