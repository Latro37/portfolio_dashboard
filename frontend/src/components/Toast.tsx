"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X, AlertCircle } from "lucide-react";

export type ToastType = "success" | "error" | "info";

interface ToastMessage {
  id: string;
  text: string;
  type: ToastType;
  persistent: boolean;
}

let _nextId = 0;
let _upsertToast: ((msg: ToastUpsert) => string) | null = null;
let _dismissToast: ((id: string) => void) | null = null;

export type ToastUpsert = {
  id?: string;
  text: string;
  type?: ToastType;
  persistent?: boolean;
  autoDismissMs?: number;
};

export function showToast(text: string, type: ToastType = "success") {
  _upsertToast?.({ text, type });
}

export function upsertToast(msg: ToastUpsert): string | null {
  return _upsertToast ? _upsertToast(msg) : null;
}

export function dismissToast(id: string) {
  _dismissToast?.(id);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timeouts = timeoutsRef.current;

    const dismiss = (id: string) => {
      const existing = timeouts.get(id);
      if (existing) {
        clearTimeout(existing);
        timeouts.delete(id);
      }
      setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const upsert = (msg: ToastUpsert) => {
      const id = msg.id ?? String(++_nextId);
      const type = msg.type ?? "success";
      const persistent = msg.persistent ?? false;
      const autoDismissMs =
        msg.autoDismissMs ?? (persistent ? undefined : 3000);

      setToasts((prev) => {
        const existingIndex = prev.findIndex((t) => t.id === id);
        const nextToast: ToastMessage = {
          id,
          text: msg.text,
          type,
          persistent,
        };

        if (existingIndex === -1) {
          return [...prev, nextToast];
        }

        const next = prev.slice();
        next[existingIndex] = nextToast;
        return next;
      });

      const existingTimeout = timeouts.get(id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        timeouts.delete(id);
      }

      if (typeof autoDismissMs === "number" && autoDismissMs > 0) {
        const timeoutId = setTimeout(() => dismiss(id), autoDismissMs);
        timeouts.set(id, timeoutId);
      }

      return id;
    };

    _upsertToast = upsert;
    _dismissToast = dismiss;

    return () => {
      _upsertToast = null;
      _dismissToast = null;
      for (const timeoutId of timeouts.values()) {
        clearTimeout(timeoutId);
      }
      timeouts.clear();
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-200 ${
            t.type === "success"
              ? "border-emerald-500/30 bg-emerald-950/90 text-emerald-300"
              : t.type === "error"
                ? "border-red-500/30 bg-red-950/90 text-red-300"
                : "border-sky-500/30 bg-sky-950/90 text-sky-200"
          }`}
        >
          {t.type === "success" ? (
            <Check className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {t.text}
          <button
            onClick={() => dismissToast(t.id)}
            className="ml-2 cursor-pointer rounded p-0.5 hover:bg-white/10"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
