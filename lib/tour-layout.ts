export type TourRect = { x: number; y: number; width: number; height: number };

export function fitTourRect(rect: TourRect, width: number, height: number): TourRect {
  const x = Math.max(8, Math.min(width - 24, rect.x));
  const y = Math.max(8, Math.min(height - 24, rect.y));
  return { x, y, width: Math.max(16, Math.min(width - x - 8, rect.width)), height: Math.max(16, Math.min(height - y - 8, rect.height)) };
}

// Keep the explanation clear of the highlighted control and the fixed skip button.
export function tourCardPosition(rect: TourRect, width: number, height: number, cardHeight = 205) {
  const cardWidth = Math.min(380, width - 32);
  const right = rect.x + rect.width + 28;
  const left = rect.x - cardWidth - 28;
  const bottom = height - cardHeight - 86;
  if (width >= 900 && right + cardWidth < width - 24)
    return { left: right, top: Math.max(24, Math.min(bottom, rect.y + 16)), width: cardWidth };
  if (width >= 900 && left > 24)
    return { left, top: Math.max(24, Math.min(bottom, rect.y + 16)), width: cardWidth };
  const below = rect.y + rect.height + 24;
  const top = below + cardHeight < height - 86 ? below : Math.max(20, rect.y - cardHeight - 24);
  return { left: Math.max(16, Math.min(width - cardWidth - 16, rect.x)), top: Math.min(Math.max(16, bottom), top), width: cardWidth };
}
