import { useCallback, useState } from "react";

type Args = {
  restoreBaseData: () => void;
};

type Result = {
  liveEnabled: boolean;
  toggleLive: (enabled: boolean) => void;
};

export function useDashboardLiveToggle({ restoreBaseData }: Args): Result {
  const [liveEnabled, setLiveEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("live_enabled");
      return stored === null ? true : stored === "true";
    }
    return true;
  });

  const toggleLive = useCallback(
    (enabled: boolean) => {
      setLiveEnabled(enabled);
      localStorage.setItem("live_enabled", String(enabled));
      if (!enabled) {
        restoreBaseData();
      }
    },
    [restoreBaseData],
  );

  return {
    liveEnabled,
    toggleLive,
  };
}
