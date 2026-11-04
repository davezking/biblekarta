// Renders a symbol kind's parts (./parts.ts) as SVG elements; shared by the sprite and the
// standalone figure.
import { createElement } from 'react';
import { partsFor, reactProps, type SymbolKind } from './parts';

export default function FigureParts({ kind }: { kind: SymbolKind }) {
  return (
    <>
      {partsFor(kind).map((part) =>
        createElement(part.tag, { key: part.name, ...reactProps(part.attrs) }),
      )}
    </>
  );
}
