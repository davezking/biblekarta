// IconButton: a button whose only content is an icon, so `label` (its accessible name) is required.
// The icon is hidden from assistive tech.
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import './ui.css';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  /** The accessible name (aria-label). Required: the icon carries no text. */
  label: string;
  children: ReactNode;
  variant?: 'default' | 'bare';
  ref?: Ref<HTMLButtonElement>;
}

export default function IconButton({
  label,
  children,
  variant = 'default',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      data-variant={variant}
      className={className ? `ui-icon-button ${className}` : 'ui-icon-button'}
      {...rest}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
