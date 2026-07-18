import { useMemo, useState } from 'react';
import type { StorageFolderNode } from '../../types/device.types';
import { formatBytes } from '../../lib/format';

interface DiskTreemapProps {
  root: StorageFolderNode;
  height?: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  node: StorageFolderNode;
  depth: number;
}

/**
 * WizTree-class squarified treemap (SVG). Largest folders dominate the map.
 */
export function DiskTreemap({ root, height = 320 }: DiskTreemapProps) {
  const [hover, setHover] = useState<StorageFolderNode | null>(null);

  const rects = useMemo(() => {
    const out: Rect[] = [];
    layout(
      root.children.length > 0 ? root.children : [root],
      0,
      0,
      1000,
      height,
      0,
      out,
    );
    return out;
  }, [root, height]);

  const palette = [
    '#1f6feb',
    '#238636',
    '#9e6a03',
    '#a371f7',
    '#da3633',
    '#39d353',
    '#58a6ff',
    '#f778ba',
  ];

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 1000 ${height}`}
        className="h-auto w-full rounded-control border border-hairline bg-canvas"
        role="img"
        aria-label="Disk usage treemap"
      >
        {rects.map((r, i) => (
          <g key={`${r.node.path}-${i}`}>
            <rect
              x={r.x}
              y={r.y}
              width={Math.max(0, r.w)}
              height={Math.max(0, r.h)}
              fill={palette[r.depth % palette.length]}
              fillOpacity={0.35 + Math.min(0.45, r.node.pctOfParent / 200)}
              stroke="#242728"
              strokeWidth={1}
              className="cursor-pointer transition-opacity hover:opacity-90"
              onMouseEnter={() => setHover(r.node)}
              onMouseLeave={() => setHover(null)}
            >
              <title>
                {r.node.name}: {formatBytes(r.node.sizeBytes)} (
                {r.node.pctOfParent.toFixed(1)}%)
              </title>
            </rect>
            {r.w > 70 && r.h > 22 ? (
              <text
                x={r.x + 6}
                y={r.y + 16}
                fill="#f4f4f6"
                fontSize={11}
                className="pointer-events-none select-none"
              >
                {truncate(r.node.name, Math.floor(r.w / 8))}
              </text>
            ) : null}
            {r.w > 90 && r.h > 36 ? (
              <text
                x={r.x + 6}
                y={r.y + 30}
                fill="#9c9c9d"
                fontSize={10}
                className="pointer-events-none select-none"
              >
                {formatBytes(r.node.sizeBytes)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <p className="text-xs text-text-muted">
        {hover
          ? `${hover.path} · ${formatBytes(hover.sizeBytes)} · ${hover.fileCount.toLocaleString()} files`
          : `${root.path} · ${formatBytes(root.sizeBytes)} · hover a block for path`}
      </p>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (max < 4) return '';
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Squarified-ish row layout for treemap children. */
function layout(
  nodes: StorageFolderNode[],
  x: number,
  y: number,
  w: number,
  h: number,
  depth: number,
  out: Rect[],
): void {
  if (nodes.length === 0 || w <= 1 || h <= 1) return;

  const total = nodes.reduce((s, n) => s + Math.max(n.sizeBytes, 1), 0);
  if (total <= 0) return;

  // Simple strip layout: horizontal if wide, vertical if tall.
  const horizontal = w >= h;
  let cursor = horizontal ? x : y;

  for (const node of nodes) {
    const share = Math.max(node.sizeBytes, 1) / total;
    if (horizontal) {
      const rw = w * share;
      out.push({ x: cursor, y, w: rw, h, node, depth });
      if (node.children.length > 0 && rw > 40 && h > 40 && depth < 3) {
        layout(
          node.children.slice(0, 12),
          cursor + 2,
          y + 2,
          Math.max(0, rw - 4),
          Math.max(0, h - 4),
          depth + 1,
          out,
        );
      }
      cursor += rw;
    } else {
      const rh = h * share;
      out.push({ x, y: cursor, w, h: rh, node, depth });
      if (node.children.length > 0 && w > 40 && rh > 40 && depth < 3) {
        layout(
          node.children.slice(0, 12),
          x + 2,
          cursor + 2,
          Math.max(0, w - 4),
          Math.max(0, rh - 4),
          depth + 1,
          out,
        );
      }
      cursor += rh;
    }
  }
}
