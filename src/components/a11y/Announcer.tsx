"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { X } from "lucide-react";

export type ToastTone = "info" | "success" | "error";

export interface ToastInput {
  message: string;
  detail?: string;
  tone?: ToastTone;
  href?: string;
  actionLabel?: string;
  /** Milliseconds before the toast hides; errors stay until dismissed. */
  durationMs?: number;
  testId?: string;
}

interface ToastEntry extends ToastInput {
  id: number;
}

interface AnnouncerContextValue {
  /** Show a visible toast; it is also announced (errors assertively). */
  toast: (input: ToastInput) => number;
  dismissToast: (id: number) => void;
  /** Announce text to screen readers without a visible toast. */
  announce: (message: string, politeness?: "polite" | "assertive") => void;
}

const AnnouncerContext = createContext<AnnouncerContextValue | null>(null);

/**
 * Toast host and live-region announcer (SPEC-v2 §2). The polite region uses
 * role=status; errors use role=alert. Both regions exist from first paint so
 * screen readers register them before any message arrives.
 */
export function AnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const announce = useCallback((message: string, politeness: "polite" | "assertive" = "polite") => {
    const set = politeness === "assertive" ? setAssertive : setPolite;
    // Clear first so a repeated message is announced again.
    set("");
    requestAnimationFrame(() => set(message));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const entry: ToastEntry = { tone: "info", ...input, id };
      setToasts((all) => [...all.slice(-2), entry]);
      const duration = input.durationMs ?? (entry.tone === "error" ? 0 : 6000);
      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismissToast(id), duration));
      }
      return id;
    },
    [dismissToast]
  );

  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const timer of all.values()) clearTimeout(timer);
      all.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismissToast, announce }), [toast, dismissToast, announce]);
  const politeToasts = toasts.filter((t) => t.tone !== "error");
  const errorToasts = toasts.filter((t) => t.tone === "error");

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div data-ksux-live="" className="pointer-events-none fixed inset-x-0 top-[var(--sp-3)] z-[60] flex flex-col items-center gap-[var(--sp-2)] px-[var(--sp-3)]">
        <div role="alert" data-testid="toast-alert-region" className="flex w-full flex-col items-center gap-[var(--sp-2)]">
          {errorToasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismissToast} />
          ))}
        </div>
        <div role="status" data-testid="toast-status-region" className="flex w-full flex-col items-center gap-[var(--sp-2)]">
          {politeToasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismissToast} />
          ))}
        </div>
      </div>
      <div data-ksux-live="" className="sr-only" role="status" data-testid="live-status">
        {polite}
      </div>
      <div data-ksux-live="" className="sr-only" role="alert" data-testid="live-alert">
        {assertive}
      </div>
    </AnnouncerContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  const tone =
    toast.tone === "error"
      ? "border-[var(--bad-fg)] bg-[var(--bad-bg)] text-[var(--bad-fg)]"
      : toast.tone === "success"
        ? "border-[var(--ok-fg)] bg-[var(--ok-bg)] text-[var(--ok-fg)]"
        : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)]";
  const body = (
    <>
      <span className="block text-sm font-bold">{toast.message}</span>
      {toast.detail && <span className="block truncate text-sm">{toast.detail}</span>}
    </>
  );
  return (
    <div
      data-testid={toast.testId}
      className={`pointer-events-auto flex w-full max-w-md items-center gap-[var(--sp-2)] rounded-[var(--r-md)] border-2 px-[var(--sp-3)] py-[var(--sp-2)] shadow-lg ${tone}`}
    >
      {toast.href ? (
        <Link
          href={toast.href}
          onClick={() => onDismiss(toast.id)}
          className="flex min-h-[var(--target)] min-w-0 flex-1 flex-col justify-center underline-offset-2 hover:underline"
        >
          {body}
          {toast.actionLabel && <span className="sr-only"> · {toast.actionLabel}</span>}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="min-target inline-flex shrink-0 items-center justify-center rounded-full hover:bg-black/5"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

const noop: AnnouncerContextValue = {
  toast: () => 0,
  dismissToast: () => {},
  announce: () => {},
};

export function useAnnouncer(): AnnouncerContextValue {
  return useContext(AnnouncerContext) ?? noop;
}
