import { AlertCircle, X } from "lucide-react";

type Props = {
  onClose: () => void;
};

export function IraDepositWarningBox({ onClose }: Props) {
  return (
    <div className="fixed bottom-6 left-6 z-[95] max-w-xl rounded-lg border border-amber-500/40 bg-amber-950/90 px-4 py-3 text-sm text-amber-100 shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-200">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
        <div className="pr-4">
          <p className="font-medium">IRA deposit warning</p>
          <p className="mt-1 text-amber-100/90">
            Composer&apos;s API does not provide IRA deposit data. Add missing deposits manually in
            the Non-Trade Activity tab to ensure performance metrics are accurate.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded p-0.5 text-amber-200 hover:bg-white/10"
          aria-label="Dismiss warning"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
