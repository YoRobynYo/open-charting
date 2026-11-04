export interface AnnotationLabel {
  x: number;
  y: number;
  width: number;
}

/**
 * Shift label boxes just enough to avoid collisions while leaving their point
 * coordinates untouched. The original y is preferred, then nearby rows are tried.
 */
export function layoutAnnotationLabels<T extends AnnotationLabel>(
  labels: readonly T[],
  bounds: { width: number; height: number },
  rowHeight = 16,
  horizontalGap = 5,
): Array<T & { labelY: number }> {
  const ordered = labels
    .map((label, index) => ({ label, index }))
    .sort((a, b) => a.label.y - b.label.y || a.label.x - b.label.x);
  const placed: Array<{ x: number; y: number; width: number }> = [];
  const result = new Array<T & { labelY: number }>(labels.length);
  const maxOffsetRows = Math.max(1, Math.ceil(bounds.height / rowHeight));

  for (const { label, index } of ordered) {
    const baseY = Math.max(rowHeight / 2, Math.min(bounds.height - rowHeight / 2, label.y));
    let labelY = baseY;
    let found = false;
    for (let row = 0; row <= maxOffsetRows && !found; row += 1) {
      const offsets = row === 0 ? [0] : [-row * rowHeight, row * rowHeight];
      for (const offset of offsets) {
        const candidate = Math.max(rowHeight / 2, Math.min(bounds.height - rowHeight / 2, baseY + offset));
        const left = label.x - label.width / 2;
        const right = label.x + label.width / 2;
        const overlaps = placed.some((other) => {
          const otherLeft = other.x - other.width / 2;
          const otherRight = other.x + other.width / 2;
          return left < otherRight + horizontalGap && right > otherLeft - horizontalGap &&
            Math.abs(candidate - other.y) < rowHeight;
        });
        if (!overlaps) {
          labelY = candidate;
          found = true;
          break;
        }
      }
    }
    placed.push({ x: label.x, y: labelY, width: label.width });
    result[index] = { ...label, labelY };
  }
  return result;
}
