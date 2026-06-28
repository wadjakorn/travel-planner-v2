'use client';

// Lightweight in-house toast system. Mount <ToastProvider> once (root layout);
// call `useToast().toast({...})` from any client component after a mutation.
// The viewport is an ARIA live region so screen readers announce results.
// Enter/exit animation is CSS-driven and disabled under prefers-reduced-motion.

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

type Toast = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms before auto-dismiss; 0 keeps it until dismissed. Default 4000. */
  duration?: number;
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
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    ({ title, description, variant = 'info', duration = 4000 }: ToastInput) => {
      const id = ++idRef.current;
      setToasts((list) => [...list, { id, title, description, variant }]);
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
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
