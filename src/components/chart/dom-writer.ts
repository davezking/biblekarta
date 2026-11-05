// Attribute writes for imperative placement during a gesture. Writing an attribute invalidates
// style and layout even when the value is unchanged, so each writer remembers what it last wrote
// and skips repeats. A writer lives as long as the nodes it was made for (one per render).

export type Write = (el: Element, name: string, value: string | null) => void;

/** A writer that sets (or, for null, removes) an attribute only when its value changed. */
export function createWriter(): Write {
  const last = new WeakMap<Element, Map<string, string | null>>();
  return (el, name, value) => {
    let seen = last.get(el);
    if (!seen) {
      seen = new Map();
      last.set(el, seen);
    }
    if (seen.has(name) && seen.get(name) === value) return;
    seen.set(name, value);
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  };
}
