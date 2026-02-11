"use client";

import { useEffect, useState } from "react";
import { Check, X, AlertCircle } from "lucide-react";

interface ToastMessage {
  id: number;
  text: string;
  type: "success" | "error";
}

let _nextId = 0;
let _addToast: ((msg: Omit<ToastMessage, "id">) => void) | null = null;

export function showToast(text: string, type: "success" | "error" = "success") {
  _addToast?.({ text, type });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    _addToast = (msg) => {
      const id = ++_nextId;
      setToasts((prev) => [...prev, { ...msg, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    };
    return () => { _addToast = null; };
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
              : "border-red-500/30 bg-red-950/90 text-red-300"
          }`}
        >
          {t.type === "success" ? (
            <Check className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {t.text}
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="ml-2 cursor-pointer rounded p-0.5 hover:bg-white/10"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
