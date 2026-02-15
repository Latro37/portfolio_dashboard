type Props = {
  liveEnabled: boolean;
  onToggle: (enabled: boolean) => void;
};

export function DashboardLiveToggleButton({
  liveEnabled,
  onToggle,
}: Props) {
  return (
    <button
      data-testid="toggle-live"
      onClick={() => onToggle(!liveEnabled)}
      className="cursor-pointer flex items-center gap-2 rounded-full border border-border/50 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
      title={
        liveEnabled
          ? "Live updates enabled - click to disable"
          : "Live updates disabled - click to enable"
      }
    >
      <span
        className={`inline-block h-2 w-2 rounded-full transition-colors ${
          liveEnabled
            ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
            : "bg-muted-foreground/40"
        }`}
      />
      <span className={liveEnabled ? "text-foreground" : "text-muted-foreground"}>
        Live
      </span>
    </button>
  );
}
