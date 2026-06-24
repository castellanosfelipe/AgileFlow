"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DialogContextValue = {
  contentRef: React.RefObject<HTMLDivElement | null>;
  descriptionId: string;
  onOpenChange: (open: boolean) => void;
  titleId: string;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => {
      const style = window.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !element.hasAttribute("aria-hidden")
      );
    });
}

export function Dialog({
  open,
  onOpenChange,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const previousActiveElementRef = React.useRef<HTMLElement | null>(null);
  const onOpenChangeRef = React.useRef(onOpenChange);
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    window.requestAnimationFrame(() => {
      const content = contentRef.current;
      if (!content) return;
      const [firstFocusable] = getFocusableElements(content);
      (firstFocusable ?? content).focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChangeRef.current(false);
        return;
      }

      if (event.key !== "Tab") return;

      const content = contentRef.current;
      if (!content) return;

      const focusableElements = getFocusableElements(content);
      if (!focusableElements.length) {
        event.preventDefault();
        content.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement || !content.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement || !content.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActiveElementRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <DialogContext.Provider
      value={{ contentRef, descriptionId, onOpenChange, titleId }}
    >
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
        <button
          aria-label="Cerrar modal"
          className="absolute inset-0 cursor-default"
          onClick={() => onOpenChange(false)}
          type="button"
        />
        {children}
      </div>
    </DialogContext.Provider>
  );
}

export function DialogContent({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const context = React.useContext(DialogContext);

  return (
    <div
      aria-describedby={context?.descriptionId}
      aria-labelledby={context?.titleId}
      className={cn(
        "relative z-10 w-full max-w-lg rounded-lg border bg-background p-5 shadow-lg",
        className
      )}
      ref={(node) => {
        if (context) context.contentRef.current = node;
      }}
      role="dialog"
      tabIndex={-1}
      aria-modal="true"
    >
      {children}
    </div>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 space-y-1">{children}</div>;
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  const context = React.useContext(DialogContext);

  return (
    <h2 className="text-lg font-semibold" id={context?.titleId}>
      {children}
    </h2>
  );
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  const context = React.useContext(DialogContext);

  return (
    <p className="text-sm text-muted-foreground" id={context?.descriptionId}>
      {children}
    </p>
  );
}

export function DialogClose({
  onClose
}: {
  onClose: () => void;
}) {
  return (
    <Button
      aria-label="Cerrar modal"
      className="absolute right-3 top-3"
      onClick={onClose}
      size="icon"
      type="button"
      variant="ghost"
    >
      <X />
    </Button>
  );
}
