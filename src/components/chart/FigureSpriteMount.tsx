// Mounts the figure symbol sprite (P2-S1-T3, src/components/figures/FigureSprite.tsx) once per
// chart. The glob finds the file when that task lands, so Chart.tsx never needs editing; until
// then it mounts nothing.
import type { ComponentType } from 'react';

type SpriteModule = { default?: ComponentType; FigureSprite?: ComponentType };
const modules = import.meta.glob<SpriteModule>('../figures/FigureSprite.tsx', { eager: true });
const mod = Object.values(modules)[0];
const Sprite: ComponentType | null = mod?.default ?? mod?.FigureSprite ?? null;

export default function FigureSpriteMount() {
  return Sprite ? <Sprite /> : null;
}
