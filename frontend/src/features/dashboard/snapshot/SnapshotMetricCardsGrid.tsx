import type { SnapshotMetricCard } from "@/features/dashboard/snapshot/types";

type Props = {
  metricCards: SnapshotMetricCard[];
};

export function SnapshotMetricCardsGrid({ metricCards }: Props) {
  if (metricCards.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 12,
        marginTop: 20,
      }}
    >
      {metricCards.map((metricCard, index) => (
        <div
          key={index}
          style={{
            backgroundColor: "#18181b",
            borderRadius: 12,
            border: "1px solid #27272a",
            padding: "12px 16px",
          }}
        >
          <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 4 }}>
            {metricCard.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: metricCard.color }}>
            {metricCard.value}
          </div>
        </div>
      ))}
    </div>
  );
}
