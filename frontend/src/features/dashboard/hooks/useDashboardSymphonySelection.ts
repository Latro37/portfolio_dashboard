import { useCallback, useState } from "react";

import type { SymphonyInfo } from "@/lib/api";

type Result = {
  selectedSymphony: SymphonyInfo | null;
  symphonyScrollTo: "trade-preview" | undefined;
  handleSymphonySelect: (symphony: SymphonyInfo) => void;
  handleSymphonyClose: () => void;
  handleTradePreviewSymphonyClick: (
    symphonyId: string,
    symphonies: SymphonyInfo[],
  ) => void;
};

export function useDashboardSymphonySelection(): Result {
  const [selectedSymphony, setSelectedSymphony] = useState<SymphonyInfo | null>(null);
  const [symphonyScrollTo, setSymphonyScrollTo] = useState<
    "trade-preview" | undefined
  >(undefined);

  const handleSymphonySelect = useCallback((symphony: SymphonyInfo) => {
    setSelectedSymphony(symphony);
    setSymphonyScrollTo(undefined);
  }, []);

  const handleSymphonyClose = useCallback(() => {
    setSelectedSymphony(null);
    setSymphonyScrollTo(undefined);
  }, []);

  const handleTradePreviewSymphonyClick = useCallback(
    (symphonyId: string, symphonies: SymphonyInfo[]) => {
      const match = symphonies.find((symphony) => symphony.id === symphonyId);
      if (!match) return;
      setSelectedSymphony(match);
      setSymphonyScrollTo("trade-preview");
    },
    [],
  );

  return {
    selectedSymphony,
    symphonyScrollTo,
    handleSymphonySelect,
    handleSymphonyClose,
    handleTradePreviewSymphonyClick,
  };
}
