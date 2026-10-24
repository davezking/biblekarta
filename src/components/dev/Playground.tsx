import { useState, type ReactNode } from 'react';
import { formatScholarly, formatTraditional } from '../../lib/core/dates';
import { fromGeez, toGeez } from '../../lib/core/geez';
import { normalizeAm } from '../../lib/core/normalize';
import type { DateValue } from '../../lib/core/schema';
import { createT } from '../../lib/i18n';

const tAm = createT('am');
const tEn = createT('en');

const CERTAINTIES = ['exact', 'approximate', 'range', 'disputed', 'tradition_only'] as const;
type Certainty = (typeof CERTAINTIES)[number];

function attempt(fn: () => string): string {
  try {
    return fn();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: '1px solid currentColor', padding: '1rem', marginBlock: '1rem' }}>
      <h2 lang="en">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBlock: '0.5rem' }}>
      <span lang="en">{label}</span> {children}
    </label>
  );
}

function GeezCard() {
  const [num, setNum] = useState('950');
  const [geez, setGeez] = useState('፲፱፻፺');
  return (
    <Card title="Ge'ez numerals">
      <Field label="Number → Ge'ez">
        <input
          type="number"
          value={num}
          onChange={(e) => setNum(e.target.value)}
          data-testid="geez-number"
        />
      </Field>
      <output data-testid="geez-number-out">{attempt(() => toGeez(Number(num)))}</output>
      <Field label="Ge'ez → number">
        <input
          lang="am"
          value={geez}
          onChange={(e) => setGeez(e.target.value)}
          data-testid="geez-text"
        />
      </Field>
      <output data-testid="geez-text-out">{attempt(() => String(fromGeez(geez)))}</output>
    </Card>
  );
}

function DatesCard() {
  const [astro, setAstro] = useState('-852');
  const [aa, setAa] = useState('3388');
  const [certainty, setCertainty] = useState<Certainty>('exact');
  const scholarly: DateValue = { start: Number(astro), certainty, method: 'anchor' };
  const traditional: DateValue = { start: Number(aa), certainty, method: 'anchor' };
  const valid = (s: string) => s.trim() !== '' && Number.isInteger(Number(s));
  return (
    <Card title="Dates">
      <Field label="Certainty">
        <select
          value={certainty}
          onChange={(e) => setCertainty(e.target.value as Certainty)}
          data-testid="certainty"
        >
          {CERTAINTIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Astronomical year (1 BC = 0)">
        <input
          type="number"
          value={astro}
          onChange={(e) => setAstro(e.target.value)}
          data-testid="astro-year"
        />
      </Field>
      {valid(astro) && (
        <p>
          <output lang="am" data-testid="scholarly-am">
            {formatScholarly(scholarly, tAm)}
          </output>
          {' · '}
          <output lang="en" data-testid="scholarly-en">
            {formatScholarly(scholarly, tEn)}
          </output>
        </p>
      )}
      <Field label="AA year (creation = 1)">
        <input
          type="number"
          value={aa}
          onChange={(e) => setAa(e.target.value)}
          data-testid="aa-year"
        />
      </Field>
      {valid(aa) && (
        <p>
          <output lang="am" data-testid="traditional-am">
            {formatTraditional(traditional, tAm)}
          </output>
          {' · '}
          <output lang="en" data-testid="traditional-en">
            {formatTraditional(traditional, tEn)}
          </output>
        </p>
      )}
    </Card>
  );
}

function NormalizerCard() {
  const [text, setText] = useState('ሐዋርያት');
  return (
    <Card title="Search normalizer">
      <Field label="Text">
        <input
          lang="am"
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="normalize-in"
        />
      </Field>
      <span lang="en">Key: </span>
      <output lang="am" data-testid="normalize-out">
        {normalizeAm(text)}
      </output>
    </Card>
  );
}

export default function Playground() {
  return (
    <div>
      <GeezCard />
      <DatesCard />
      <NormalizerCard />
    </div>
  );
}
