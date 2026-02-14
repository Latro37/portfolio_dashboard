"use client";

import { useEffect, useRef, useState } from "react";
import { X, BookOpen, Calculator } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

type GuideView = "menu" | "user-guide" | "metrics-guide";

interface Props {
  onClose: () => void;
}

export function HelpModal({ onClose }: Props) {
  const [view, setView] = useState<GuideView>("menu");
  const [markdown, setMarkdown] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    if (view === "menu") return;
    let cancelled = false;
    const endpoint = view === "user-guide" ? "/user-guide" : "/metrics-guide";
    fetch(`${API_BASE}${endpoint}`)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setMarkdown(text);
      })
      .catch(() => {
        if (!cancelled) setMarkdown("Failed to load guide.");
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (anchor) {
      const href = anchor.getAttribute("href");
      if (href?.startsWith("#")) {
        e.preventDefault();
        const el = contentRef.current?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative mx-4 my-8 w-full max-w-4xl rounded-2xl border border-border bg-background shadow-2xl">
        <button
          onClick={onClose}
          className="cursor-pointer absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {view !== "menu" && (
          <button
            onClick={() => setView("menu")}
            className="cursor-pointer absolute left-4 top-4 z-10 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border/50 hover:bg-muted"
          >
            ← Back
          </button>
        )}

        {view === "menu" ? (
          <div className="p-8 pt-14">
            <h2 className="text-xl font-semibold text-foreground mb-6 text-center">Help & Documentation</h2>
            <div className="grid gap-4 max-w-md mx-auto">
              <button
                onClick={() => {
                  setMarkdown(null);
                  setView("user-guide");
                }}
                className="cursor-pointer flex items-center gap-4 rounded-xl border border-border/50 p-5 text-left hover:bg-muted/50 transition-colors"
              >
                <BookOpen className="h-6 w-6 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">User Guide</p>
                  <p className="text-sm text-muted-foreground">Features, setup, dashboard walkthrough, troubleshooting</p>
                </div>
              </button>
              <button
                onClick={() => {
                  setMarkdown(null);
                  setView("metrics-guide");
                }}
                className="cursor-pointer flex items-center gap-4 rounded-xl border border-border/50 p-5 text-left hover:bg-muted/50 transition-colors"
              >
                <Calculator className="h-6 w-6 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Metrics Guide</p>
                  <p className="text-sm text-muted-foreground">Detailed metric formulas and calculations</p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div ref={contentRef} onClick={handleContentClick} className="p-8 prose prose-invert prose-sm max-w-none
            prose-headings:text-foreground prose-headings:font-semibold
            prose-h1:text-2xl prose-h1:border-b prose-h1:border-border prose-h1:pb-3 prose-h1:mb-6
            prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3
            prose-p:text-muted-foreground prose-p:leading-relaxed
            prose-strong:text-foreground
            prose-code:text-emerald-400 prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-muted prose-pre:border prose-pre:border-border/50 prose-pre:rounded-lg
            prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline
            prose-li:text-muted-foreground
            prose-th:text-foreground prose-th:text-xs prose-th:uppercase prose-th:tracking-wider
            prose-td:text-muted-foreground prose-td:text-sm
            prose-table:border-collapse
            prose-tr:border-b prose-tr:border-border/30
            prose-hr:border-border/50
          ">
            {markdown === null ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
                Loading...
              </div>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>{markdown}</ReactMarkdown>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
