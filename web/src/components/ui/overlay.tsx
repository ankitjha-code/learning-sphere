import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Dialog as RDialog, DropdownMenu as RMenu, Popover as RPopover } from 'radix-ui';
import { XIcon, DotsThreeIcon } from '@phosphor-icons/react';
import { Button } from './button';
import { Input } from './form';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  describedInBody,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** The body renders its own RDialog.Description (used by ConfirmDialog). */
  describedInBody?: boolean;
}) {
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-[#0d1020]/45 backdrop-blur-[3px] data-[state=open]:animate-in" />
        <RDialog.Content
          className={clsx(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface shadow-3 focus:outline-none',
            width,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div className="min-w-0">
              <RDialog.Title className="font-display text-[18px] font-semibold tracking-[-0.015em]">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-0.5 text-[13px] text-muted">{description}</RDialog.Description>
              ) : describedInBody ? null : (
                <RDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RDialog.Description>
              )}
            </div>
            <RDialog.Close asChild>
              <button className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
                <XIcon size={18} />
              </button>
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-border bg-surface-2 px-6 py-3.5">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/**
 * Confirmation for consequential actions. For destructive actions pass `confirmText`
 * (e.g. the object's name) and the user must type it to proceed.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  danger,
  confirmText,
  loading,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => unknown;
  danger?: boolean;
  confirmText?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  const [typed, setTyped] = useState('');
  const blocked = !!confirmText && typed.trim() !== confirmText;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setTyped('');
        onOpenChange(v);
      }}
      title={title}
      describedInBody
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            disabled={blocked}
            disabledReason={blocked ? `Type "${confirmText}" to confirm` : undefined}
            onClick={() => onConfirm()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[14px] text-muted">
        <RDialog.Description asChild>
          <div>{description}</div>
        </RDialog.Description>
        {children}
        {confirmText && (
          <div className="space-y-1.5">
            <label className="text-[13px] text-fg" htmlFor="confirm-text">
              Type <span className="font-mono font-semibold">{confirmText}</span> to confirm
            </label>
            <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
      </div>
    </Dialog>
  );
}

export type MenuItem = { label: string; onSelect: () => void; icon?: ReactNode; danger?: boolean; disabled?: boolean } | 'separator';

export function Menu({ items, trigger, label = 'More actions', align = 'end' }: { items: MenuItem[]; trigger?: ReactNode; label?: string; align?: 'start' | 'end' }) {
  return (
    <RMenu.Root>
      <RMenu.Trigger asChild>
        {trigger ?? (
          <button className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" aria-label={label}>
            <DotsThreeIcon size={18} weight="bold" />
          </button>
        )}
      </RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content align={align} sideOffset={4} className="z-50 min-w-48 rounded-lg border border-border bg-surface p-1.5 shadow-2">
          {items.map((it, i) =>
            it === 'separator' ? (
              <RMenu.Separator key={i} className="my-1 h-px bg-border" />
            ) : (
              <RMenu.Item
                key={i}
                disabled={it.disabled}
                onSelect={it.onSelect}
                className={clsx(
                  'flex h-8 cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50 [&_svg]:text-subtle',
                  it.danger ? 'text-danger' : 'text-fg',
                )}
              >
                {it.icon}
                {it.label}
              </RMenu.Item>
            ),
          )}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}

export function Popover({ trigger, children, align = 'end', className }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string }) {
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content align={align} sideOffset={6} className={clsx('z-50 rounded-lg border border-border bg-surface shadow-2 focus:outline-none', className)}>
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

export const PopoverClose = RPopover.Close;
