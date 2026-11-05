// Button: the base control. A native <button> (type="button" unless given), ≥ 44 px hit area.
import type { ButtonHTMLAttributes, Ref } from 'react';
import './ui.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary';
  ref?: Ref<HTMLButtonElement>;
}

export default function Button({
  variant = 'default',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant}
      className={className ? `ui-button ${className}` : 'ui-button'}
      {...rest}
    />
  );
}
