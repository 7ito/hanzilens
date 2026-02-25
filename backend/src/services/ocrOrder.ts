export type OcrReadingDirection = 'horizontal' | 'vertical-rtl';

interface OcrBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface OcrSortableLine {
  text: string;
  box: OcrBox;
}

interface LineSample<T extends OcrSortableLine> {
  line: T;
  index: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

interface AxisGroup<T extends OcrSortableLine> {
  axis: number;
  items: Array<LineSample<T>>;
}

const ASPECT_RATIO_THRESHOLD = 1.35;
const AXIS_TOLERANCE_MIN = 0.01;
const AXIS_TOLERANCE_MAX = 0.08;
const VERTICAL_WIN_MARGIN = 0.45;

const CLOSING_PUNCTUATION = /[，。！？；：、\)\]】》」』〕〉]/;
const OPENING_PUNCTUATION = /[（\(\[【《「『〔〈]/;
const CHINESE_CHAR = /[\u4e00-\u9fff]/;
const TERMINAL_PUNCTUATION = /[。！？!?]/;

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function axisTolerance(dimensions: number[]): number {
  const medianDimension = median(dimensions.filter((value) => Number.isFinite(value) && value > 0));
  if (medianDimension <= 0) {
    return 0.02;
  }

  return clamp(medianDimension * 0.7, AXIS_TOLERANCE_MIN, AXIS_TOLERANCE_MAX);
}

function groupByAxis<T extends OcrSortableLine>(
  samples: Array<LineSample<T>>,
  axis: 'centerX' | 'centerY',
  tolerance: number
): Array<AxisGroup<T>> {
  const sorted = [...samples].sort((a, b) => {
    const diff = a[axis] - b[axis];
    if (Math.abs(diff) > 1e-6) return diff;
    return a.index - b.index;
  });

  const groups: Array<AxisGroup<T>> = [];

  sorted.forEach((sample) => {
    const value = sample[axis];
    const current = groups[groups.length - 1];

    if (!current) {
      groups.push({ axis: value, items: [sample] });
      return;
    }

    if (Math.abs(value - current.axis) <= tolerance) {
      const newCount = current.items.length + 1;
      current.axis = (current.axis * current.items.length + value) / newCount;
      current.items.push(sample);
      return;
    }

    groups.push({ axis: value, items: [sample] });
  });

  return groups;
}

function toSamples<T extends OcrSortableLine>(lines: T[]): Array<LineSample<T>> {
  return lines.map((line, index) => ({
    line,
    index,
    centerX: line.box.x + line.box.w / 2,
    centerY: line.box.y + line.box.h / 2,
    width: Math.max(line.box.w, 1e-6),
    height: Math.max(line.box.h, 1e-6),
  }));
}

function sortHorizontalRowMajor<T extends OcrSortableLine>(samples: Array<LineSample<T>>): T[] {
  const tolerance = axisTolerance(samples.map((sample) => sample.height));
  const rows = groupByAxis(samples, 'centerY', tolerance);

  rows.sort((a, b) => a.axis - b.axis);

  const ordered: T[] = [];
  rows.forEach((row) => {
    row.items
      .sort((a, b) => {
        const diff = a.centerX - b.centerX;
        if (Math.abs(diff) > 1e-6) return diff;
        return a.index - b.index;
      })
      .forEach((sample) => ordered.push(sample.line));
  });

  return ordered;
}

function sortVerticalRtl<T extends OcrSortableLine>(samples: Array<LineSample<T>>): T[] {
  const tolerance = axisTolerance(samples.map((sample) => sample.width));
  const columns = groupByAxis(samples, 'centerX', tolerance);

  columns.sort((a, b) => b.axis - a.axis);

  const ordered: T[] = [];
  columns.forEach((column) => {
    column.items
      .sort((a, b) => {
        const diff = a.centerY - b.centerY;
        if (Math.abs(diff) > 1e-6) return diff;
        return a.index - b.index;
      })
      .forEach((sample) => ordered.push(sample.line));
  });

  return ordered;
}

function firstChar(text: string): string | null {
  const value = text.trim();
  return value ? value[0] : null;
}

function lastChar(text: string): string | null {
  const value = text.trim();
  return value ? value[value.length - 1] : null;
}

function scoreLineBoundaries<T extends OcrSortableLine>(lines: T[]): number {
  if (lines.length <= 1) return 0;

  let score = 0;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const left = lastChar(lines[index].text);
    const right = firstChar(lines[index + 1].text);

    if (!left || !right) continue;

    if (OPENING_PUNCTUATION.test(left)) score -= 1.6;
    if (CLOSING_PUNCTUATION.test(right)) score -= 1.6;

    if (CHINESE_CHAR.test(left) && CHINESE_CHAR.test(right)) {
      score += 0.35;
    }

    if (TERMINAL_PUNCTUATION.test(left) && CHINESE_CHAR.test(right)) {
      score += 0.2;
    }
  }

  return score;
}

function geometryDirectionBias<T extends OcrSortableLine>(samples: Array<LineSample<T>>): {
  horizontal: number;
  verticalRtl: number;
} {
  if (samples.length === 0) {
    return { horizontal: 0, verticalRtl: 0 };
  }

  let horizontal = 0;
  let verticalRtl = 0;

  samples.forEach((sample) => {
    const ratio = sample.width / sample.height;
    if (ratio >= ASPECT_RATIO_THRESHOLD) {
      horizontal += 1;
    } else if (ratio <= 1 / ASPECT_RATIO_THRESHOLD) {
      verticalRtl += 1;
    }
  });

  const minimumStrongVotes = Math.ceil(samples.length * 0.65);
  if (horizontal >= minimumStrongVotes) {
    horizontal += 1.5;
  }

  if (verticalRtl >= minimumStrongVotes) {
    verticalRtl += 1.5;
  }

  return { horizontal, verticalRtl };
}

/**
 * Sort OCR lines into reading order. Supports horizontal and vertical (RTL columns)
 * and chooses the most plausible sequence using lightweight geometry + boundary heuristics.
 */
export function orderOcrLines<T extends OcrSortableLine>(lines: T[]): {
  lines: T[];
  direction: OcrReadingDirection;
} {
  if (lines.length <= 1) {
    return { lines: [...lines], direction: 'horizontal' };
  }

  const samples = toSamples(lines);
  const horizontalLines = sortHorizontalRowMajor(samples);
  const verticalLines = sortVerticalRtl(samples);
  const geometryBias = geometryDirectionBias(samples);

  const horizontalScore = scoreLineBoundaries(horizontalLines) + geometryBias.horizontal;
  const verticalScore = scoreLineBoundaries(verticalLines) + geometryBias.verticalRtl;

  if (verticalScore > horizontalScore + VERTICAL_WIN_MARGIN) {
    return { lines: verticalLines, direction: 'vertical-rtl' };
  }

  return { lines: horizontalLines, direction: 'horizontal' };
}
