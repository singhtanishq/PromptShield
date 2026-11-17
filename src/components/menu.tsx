import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItemDef {
  id: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  disabled?: boolean;
  destructive?: boolean;
}

/**
 * Accessible dropdown menu (WAI-ARIA menu pattern): trigger with aria-haspopup,
 * keyboard navigation (arrows/Home/End/Escape), click-outside dismissal, and
 * focus restoration to the trigger.
 */
export function Menu({
  trigger,
  items,
  onAction,
  align = 'start',
  triggerLabel,
}: {
  trigger: (props: { open: boolean; toggle: () => void; menuId: string }) => ReactNode;
  items: MenuItemDef[];
  onAction: (id: string) => void;
  align?: 'start' | 'end';
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const activeIndex = useRef(0);

  const close = (restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) {
      const triggerButton = triggerWrapRef.current?.querySelector<HTMLElement>('button');
      triggerButton?.focus();
    }
  };

  const toggle = (): void => {
    setOpen((prev) => {
      if (!prev) activeIndex.current = 0;
      return !prev;
    });
  };

  // Position the floating menu near the trigger; close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const rect = triggerWrapRef.current?.getBoundingClientRect();
    if (rect !== undefined) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const estimatedHeight = Math.min(items.length * 44 + 12, 320);
      const openUpwards = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      setPosition({
        top: openUpwards ? rect.top - estimatedHeight - 6 : rect.bottom + 6,
        left: align === 'end' ? rect.right : rect.left,
      });
    }
    const onPointerDown = (e: PointerEvent): void => {
      if (
        !triggerWrapRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        close(true);
      }
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, align, items.length]);

  // Focus management within the menu.
  useEffect(() => {
    if (!open || position === null) return;
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    const target = buttons[activeIndex.current];
    if (target !== undefined) target.focus();
  }, [open, position]);

  const onMenuKeyDown = (e: React.KeyboardEvent): void => {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    if (buttons.length === 0) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = currentIndex;
    switch (e.key) {
      case 'ArrowDown':
        nextIndex = currentIndex < 0 || currentIndex === buttons.length - 1 ? 0 : currentIndex + 1;
        break;
      case 'ArrowUp':
        nextIndex = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = buttons.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    activeIndex.current = nextIndex;
    (buttons[nextIndex] as HTMLButtonElement).focus();
  };

  return (
    <div ref={triggerWrapRef} className="inline-flex">
      {trigger({ open, toggle, menuId })}
      {open &&
        position !== null &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={triggerLabel}
            onKeyDown={onMenuKeyDown}
            style={{
              position: 'fixed',
              top: `${position.top}px`,
              left: `${position.left}px`,
              transform: align === 'end' ? 'translateX(-100%)' : undefined,
            }}
            className="scroll-slim z-50 max-h-80 min-w-56 max-w-96 overflow-y-auto rounded-lg border border-line
              bg-surface py-1.5 shadow-pop"
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close(true);
                  onAction(item.id);
                }}
                className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm transition-colors
                  disabled:cursor-not-allowed disabled:opacity-50
                  ${
                    item.destructive
                      ? 'text-danger hover:bg-danger-soft'
                      : 'text-ink hover:bg-surface-hover'
                  }`}
              >
                {item.icon !== undefined && (
                  <span aria-hidden="true" className="mt-0.5 shrink-0 text-ink-faint">
                    {item.icon}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block font-medium leading-tight">{item.label}</span>
                  {item.description !== undefined && (
                    <span className="mt-0.5 block text-2xs leading-snug text-ink-faint">
                      {item.description}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
