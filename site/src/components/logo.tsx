import type { SVGProps } from "react";

// "B7" on a 11×7 pixel grid. Column 5 is the gap the intro zooms through.
const ROWS = [
  "11110011111",
  "10001000001",
  "10001000010",
  "11110000100",
  "10001001000",
  "10001001000",
  "11110001000",
];

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 11 7"
      fill="currentColor"
      shapeRendering="crispEdges"
      role="img"
      aria-label="B7"
      {...props}
    >
      {ROWS.flatMap((row, y) =>
        [...row].map((on, x) =>
          on === "1" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed grid, the position is the identity
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
          ) : null,
        ),
      )}
    </svg>
  );
}
