// TitleCartouche: the centred title block of the mockup (design-reference/board5-desktop.html,
// <header>): a 26 px harag band above, the ፨ ፨ ፨ ornament, the title in red Abyssinica (rubric,
// never bold), an optional subtitle in black ink, and an 18 px band below. The title is real text,
// outside the bands' SVGs, so it is read and found by search.
import HaragBand from './HaragBand';
import './ornament.css';

export interface TitleCartoucheProps {
  title: string;
  subtitle?: string;
}

export default function TitleCartouche({ title, subtitle }: TitleCartoucheProps) {
  return (
    <header className="title-cartouche">
      <HaragBand height={26} />
      <div className="title-cartouche-body">
        <span className="title-cartouche-mark" aria-hidden="true">
          ፨ ፨ ፨
        </span>
        <h1 className="title-cartouche-title rubric">{title}</h1>
        {subtitle ? <p className="title-cartouche-subtitle">{subtitle}</p> : null}
      </div>
      <HaragBand height={18} />
    </header>
  );
}
