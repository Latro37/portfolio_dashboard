import { RefObject, useEffect } from "react";

import { SymphonyTradePreview } from "@/lib/api";

type Args = {
  scrollToSection?: "trade-preview";
  tradePreview: SymphonyTradePreview | null;
  tradePreviewRef: RefObject<HTMLDivElement | null>;
};

export function useSymphonyDetailViewEffects({
  scrollToSection,
  tradePreview,
  tradePreviewRef,
}: Args) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (scrollToSection === "trade-preview" && tradePreviewRef.current) {
      tradePreviewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [scrollToSection, tradePreview, tradePreviewRef]);
}
