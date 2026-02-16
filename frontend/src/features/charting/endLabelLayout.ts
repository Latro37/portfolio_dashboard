export type LabelCandidate = {
  id: string;
  rawY: number;
};

export function stackLabelPositions(
  candidates: LabelCandidate[],
  minY: number,
  maxY: number,
  minGap: number,
): Record<string, number> {
  if (!candidates.length) return {};

  const sorted = [...candidates].sort((a, b) => {
    if (a.rawY === b.rawY) return a.id.localeCompare(b.id);
    return a.rawY - b.rawY;
  });

  const placed: Array<LabelCandidate & { y: number }> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const candidate = sorted[i];
    if (i === 0) {
      placed.push({ ...candidate, y: Math.min(maxY, Math.max(minY, candidate.rawY)) });
      continue;
    }

    const prevY = placed[i - 1].y;
    placed.push({
      ...candidate,
      y: Math.max(candidate.rawY, prevY + minGap),
    });
  }

  const overflow = placed[placed.length - 1].y - maxY;
  if (overflow > 0) {
    for (let i = 0; i < placed.length; i += 1) {
      placed[i].y -= overflow;
    }
  }

  if (placed[0].y < minY) {
    const shiftDown = minY - placed[0].y;
    for (let i = 0; i < placed.length; i += 1) {
      placed[i].y += shiftDown;
    }
  }

  for (let i = 1; i < placed.length; i += 1) {
    if (placed[i].y < placed[i - 1].y + minGap) {
      placed[i].y = placed[i - 1].y + minGap;
    }
  }

  if (placed[placed.length - 1].y > maxY) {
    const shiftUp = placed[placed.length - 1].y - maxY;
    for (let i = 0; i < placed.length; i += 1) {
      placed[i].y -= shiftUp;
    }
  }

  const result: Record<string, number> = {};
  placed.forEach((item) => {
    result[item.id] = item.y;
  });

  return result;
}

export function valueToPixelY(
  value: number,
  domainMin: number,
  domainMax: number,
  minY: number,
  maxY: number,
): number {
  if (domainMax === domainMin) {
    return minY + (maxY - minY) / 2;
  }
  const ratio = (domainMax - value) / (domainMax - domainMin);
  return minY + ratio * (maxY - minY);
}
