import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, cloneElement, isValidElement, type ReactElement } from 'react';
import clsx from 'clsx';
import { Switch as RSwitch, Checkbox as RCheckbox } from 'radix-ui';
import { CheckIcon, CaretDownIcon } from '@phosphor-icons/react';

/** Full width unless the caller sets its own width class (e.g. w-36). */
const width = (className?: string) => (/(^|\s)(w-|max-w-|min-w-)/.test(className ?? '') ? '' : 'w-full');

const control =
  'rounded-md border border-border bg-surface px-3 text-[14px] text-fg placeholder:text-subtle shadow-1 transition-[border-color,box-shadow] hover:border-border-strong focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-wash)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 aria-[invalid=true]:border-danger disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(control, width(className), 'h-9', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={clsx(control, width(className), 'py-2 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className={clsx('relative', width(className) ? '' : 'shrink-0')}>
      <select ref={ref} className={clsx(control, width(className), 'h-9 appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <CaretDownIcon size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
    </div>
  );
});

/**
 * Label above, helper below, error replaces helper. Wires id/aria attributes into
 * the single child control automatically.
 */
export function Field({
  label,
  helper,
  error,
  required,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  helper?: ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  children: ReactElement;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': helper || error ? hintId : undefined,
        required,
      })
    : children;
  return (
    <div className={clsx('space-y-1.5', className)}>
      <label htmlFor={id} className="flex items-center gap-1 text-[13px] font-medium text-fg">
        {label}
        {optional && <span className="font-normal text-subtle">(optional)</span>}
      </label>
      {child}
      {(error || helper) && (
        <p id={hintId} className={clsx('text-[12.5px]', error ? 'text-danger' : 'text-subtle')} role={error ? 'alert' : undefined}>
          {error ?? helper}
        </p>
      )}
    </div>
  );
}

export function Switch({ checked, onCheckedChange, label, description, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <div className="text-[14px] font-medium">{label}</div>
        {description && <div className="text-[12.5px] text-muted">{description}</div>}
      </label>
      <RSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-accent disabled:opacity-50"
      >
        <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-1 transition-transform data-[state=checked]:translate-x-[18px]" />
      </RSwitch.Root>
    </div>
  );
}

export function Checkbox({ checked, onCheckedChange, label, description, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <RCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border border-border-strong bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-50"
      >
        <RCheckbox.Indicator>
          <CheckIcon size={12} weight="bold" className="text-on-accent" />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      <label htmlFor={id} className="cursor-pointer text-[14px] leading-5">
        {label}
        {description && <div className="text-[12.5px] text-muted">{description}</div>}
      </label>
    </div>
  );
}

/** Segmented control for 2-5 mutually exclusive options. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-9 items-center rounded-md border border-border bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'inline-flex h-full items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium transition-colors',
            value === o.value ? 'bg-surface text-fg shadow-1 ring-1 ring-border' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Comma-separated tags input kept deliberately simple and accessible. */
export function TagsInput({ value, onChange, placeholder, id }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string }) {
  return (
    <Input
      id={id}
      defaultValue={value.join(', ')}
      placeholder={placeholder ?? 'Separate with commas'}
      onBlur={(e) =>
        onChange(
          e.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
    />
  );
}
