// FigureSprite: the figure symbols (DR-9), one <symbol> per kind, in one hidden <svg>. The chart
// mounts it once (FigureSpriteMount); every Figure then draws with <use>, so 200 figures share one
// set of paths. The tone comes from --fig-tone on each Figure's root.
import FigureParts from './FigureParts';
import { SYMBOL_KINDS, symbolId, VIEWBOX } from './parts';

export default function FigureSprite() {
  return (
    <svg
      className="figure-sprite"
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', overflow: 'hidden' }}
    >
      {SYMBOL_KINDS.map((kind) => (
        <symbol key={kind} id={symbolId(kind)} viewBox={VIEWBOX}>
          <FigureParts kind={kind} />
        </symbol>
      ))}
    </svg>
  );
}
