import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import clsx from 'clsx';
import { Spinner } from './display';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium rounded-md transition-[background-color,border-color,color,box-shadow,transform] duration-150 select-none active:translate-y-px disabled:opacity-55 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 [&_svg]:shrink-0';

const variants: Record<Variant, string> = {
  primary: 'bg-accent bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent)_82%,white),var(--accent))] text-on-accent hover:bg-accent-hover hover:bg-none shadow-accent',
  secondary: 'bg-surface text-fg border border-border hover:border-border-strong hover:bg-surface-2 shadow-1',
  ghost: 'text-muted hover:text-fg hover:bg-surface-3/60',
  danger: 'bg-danger text-white hover:opacity-90 shadow-1 dark:text-black',
  soft: 'bg-accent-soft text-accent-text hover:bg-accent-soft/70',
};

// Heights line up with form controls: sm 32px, md 36px (same as Input/Select), lg 44px.
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-[14px]',
  lg: 'h-11 px-5 text-[15px]',
  icon: 'h-9 w-9',
  'icon-sm': 'h-8 w-8',
};

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  /** Shown as a tooltip-like title when disabled, so a disabled button always explains why. */
  disabledReason?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, disabledReason, type = 'button', ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  const btn = (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  );
  if (disabled && disabledReason) {
    return (
      <span title={disabledReason} className="inline-flex" tabIndex={0} aria-label={disabledReason}>
        {btn}
      </span>
    );
  }
  return btn;
});

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
