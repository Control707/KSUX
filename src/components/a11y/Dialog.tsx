"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable=true]",
].join(",");

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("inert") && el.getClientRects().length > 0
  );
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Visible title; also the dialog's accessible name. */
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** `sheet` slides up from the bottom on phones; `dialog` is centred. */
  variant?: "sheet" | "dialog";
  /** `alertdialog` for interruptions that need a decision. */
  role?: "dialog" | "alertdialog";
  /** Element to focus first; defaults to the first field, then the first control. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Hide the visible title while keeping it as the accessible name. */
  hideTitle?: boolean;
  closeLabel?: string;
  testId?: string;
  className?: string;
}

/**
 * Shared dialog/sheet primitive (SPEC-v2 §2): role=dialog|alertdialog,
 * aria-modal, Escape dismissal, an inert background, focus moved in on open,
 * trapped while open and restored to the trigger on close.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  variant = "dialog",
  role = "dialog",
  initialFocusRef,
  hideTitle = false,
  closeLabel = "Close",
  testId,
  className = "",
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Inert background + focus in/restore. Layout effect so the trigger is
  // captured before anything else moves focus.
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trigger = document.activeElement as HTMLElement | null;
    const portalRoot = panel.closest("[data-owlside-portal]") as HTMLElement | null;
    const changed: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === portalRoot || el.contains(panel)) continue;
      if (el.tagName === "SCRIPT" || el.hasAttribute("inert")) continue;
      // Toasts and announcements must keep speaking while a dialog is open.
      if (el.hasAttribute("data-owlside-live")) continue;
      el.setAttribute("inert", "");
      changed.push(el);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const target =
      initialFocusRef?.current ??
      panel.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea") ??
      focusableWithin(panel).find((el) => el.dataset.dialogClose === undefined) ??
      panel;
    target.focus({ preventScroll: false });

    return () => {
      for (const el of changed) el.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
      if (trigger && trigger.isConnected && typeof trigger.focus === "function") {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [open, mounted, initialFocusRef]);

  if (!open || !mounted) return null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const items = focusableWithin(panelRef.current);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const isSheet = variant === "sheet";

  return createPortal(
    <div data-owlside-portal="">
      <div
        className="owlside-backdrop fixed inset-0 z-50 bg-black/55"
        aria-hidden="true"
        onClick={() => onCloseRef.current()}
      />
      <div
        className={`pointer-events-none fixed inset-0 z-50 flex justify-center ${
          isSheet ? "items-end sm:items-center" : "items-center p-4"
        }`}
      >
        <div
          ref={panelRef}
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          data-testid={testId}
          onKeyDown={onKeyDown}
          className={`pointer-events-auto max-h-[90dvh] w-full overflow-y-auto bg-[var(--surface)] text-[var(--ink)] shadow-2xl outline-none ${
            isSheet
              ? "owlside-sheet max-w-xl rounded-t-[var(--r-lg)] p-[var(--sp-4)] pb-[calc(var(--sp-4)+env(safe-area-inset-bottom,0px))] sm:rounded-[var(--r-lg)]"
              : "owlside-dialog max-w-lg rounded-[var(--r-lg)] p-[var(--sp-5)]"
          } ${className}`}
        >
          <div className="flex items-start justify-between gap-[var(--sp-3)]">
            <h2
              id={titleId}
              className={
                hideTitle
                  ? "sr-only"
                  : "font-display text-[length:var(--fs-xl)] font-bold leading-tight"
              }
            >
              {title}
            </h2>
            <button
              type="button"
              data-dialog-close=""
              aria-label={closeLabel}
              onClick={() => onCloseRef.current()}
              className="min-target -mr-2 -mt-2 inline-flex shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          {description && (
            <p id={descriptionId} className="mt-[var(--sp-1)] text-[length:var(--fs-sm)] text-[var(--muted)]">
              {description}
            </p>
          )}
          <div className="mt-[var(--sp-3)]">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
