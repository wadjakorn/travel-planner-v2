'use client';

// Lightweight in-house toast system. Mount <ToastProvider> once (root layout);
// call `useToast().toast({...})` from any client component after a mutation.
// The viewport is an ARIA live region so screen readers announce results.
// Enter/exit animation is CSS-driven and disabled under prefers-reduced-motion.
// A toast's timer pauses while it is hovered or holds focus (WCAG 2.2.1), so a
// toast with an `action` button can be reached by keyboard before it expires.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Close } from '@/components/icons';

export type ToastVariant = 'success' | 'error' | 'info';

// Self-contained variant glyphs (icons.tsx has no check-circle / alert / info).
type GlyphProps = React.SVGProps<SVGSVGElement>;
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
function SuccessGlyph(p: GlyphProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}
function ErrorGlyph(p: GlyphProps) {
  return (
    <svg {...base} {...p}>
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
function InfoGlyph(p: GlyphProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

type ToastAction = { label: string; onAction: () => void };

type Toast = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  action?: ToastAction;
};

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** A text button before ✕; clicking it runs `onAction`, then dismisses. */
  action?: ToastAction;
  /** ms before auto-dismiss; 0 keeps it until dismissed. Default 4000, or 8000 with an `action`. */
  duration?: number;
};

// Per-toast countdown. `holds` = why it is paused (pointer over it, focus
// inside it); the timer runs only while the set is empty.
type Countdown = {
  timer: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
  holds: Set<'hover' | 'focus'>;
};

type ToastContextValue = {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const ICON: Record<ToastVariant, React.ComponentType<GlyphProps>> = {
  success: SuccessGlyph,
  error: ErrorGlyph,
  info: InfoGlyph,
};

const ACCENT: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-brand',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const countdowns = useRef<Map<number, Countdown>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const c = countdowns.current.get(id);
    if (c?.timer) clearTimeout(c.timer);
    countdowns.current.delete(id);
  }, []);

  const start = useCallback(
    (id: number, c: Countdown) => {
      c.startedAt = Date.now();
      c.timer = setTimeout(() => dismiss(id), Math.max(0, c.remaining));
    },
    [dismiss],
  );

  const hold = useCallback((id: number, reason: 'hover' | 'focus') => {
    const c = countdowns.current.get(id);
    if (!c) return;
    c.holds.add(reason);
    if (c.timer) {
      clearTimeout(c.timer);
      c.timer = null;
      c.remaining -= Date.now() - c.startedAt;
    }
  }, []);

  const release = useCallback(
    (id: number, reason: 'hover' | 'focus') => {
      const c = countdowns.current.get(id);
      if (!c) return;
      c.holds.delete(reason);
      if (c.holds.size === 0 && !c.timer) start(id, c);
    },
    [start],
  );

  const toast = useCallback(
    ({ title, description, variant = 'info', action, duration }: ToastInput) => {
      const id = ++idRef.current;
      const ms = duration ?? (action ? 8000 : 4000);
      setToasts((list) => [...list, { id, title, description, variant, action }]);
      if (ms > 0) {
        const c: Countdown = { timer: null, remaining: ms, startedAt: 0, holds: new Set() };
        countdowns.current.set(id, c);
        start(id, c);
      }
      return id;
    },
    [start],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ol
        aria-label="Notifications"
        role="region"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-toast)] mx-auto flex w-full max-w-sm flex-col gap-2 p-4 sm:bottom-4 sm:right-4 sm:left-auto sm:mx-0 sm:p-0"
      >
        {toasts.map((t) => {
          const Icon = ICON[t.variant];
          return (
            <li
              key={t.id}
              role={t.variant === 'error' ? 'alert' : 'status'}
              onPointerEnter={() => hold(t.id, 'hover')}
              onPointerLeave={() => release(t.id, 'hover')}
              onFocus={() => hold(t.id, 'focus')}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  release(t.id, 'focus');
                }
              }}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-[var(--shadow-lg)] motion-safe:animate-[toast-in_180ms_ease-out]"
            >
              <Icon
                width={18}
                height={18}
                className={`mt-0.5 shrink-0 ${ACCENT[t.variant]}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{t.title}</p>
                {t.description ? (
                  <p className="mt-0.5 text-xs text-muted">{t.description}</p>
                ) : null}
              </div>
              {t.action ? (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onAction();
                    dismiss(t.id);
                  }}
                  className="-my-2 inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-semibold text-brand transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t.action.label}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Close width={14} height={14} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </ToastContext.Provider>
  );
}
