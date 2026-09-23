import type { SVGProps } from "react";

const paths = {
  archive: "M3 3h18v5H3zM5 8v13h14V8M9 12h6",
  search: "M21 21l-6-6M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14",
  check: "m5 12 4 4L19 6",
  external: "M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7",
  mail: "M3 5h18v14H3zM3 5l9 7 9-7",
  calendar: "M3 5h18v16H3zM3 10h18M7 3v4M17 3v4M7 14h3M14 14h3",
  ticket:
    "M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4zM15 5v3M15 11v2M15 16v3",
  back: "m14 5-7 7 7 7M7 12h14",
  plus: "M12 5v14M5 12h14",
  edit: "m16 3 5 5-12 12-6 1 1-6zM14 5l5 5",
  outline: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  settings: "M4 4h16v16H4zM14 4v16",
  undo: "M9 5 4 10l5 5M4 10h10a6 6 0 0 1 6 6v3",
  redo: "m15 5 5 5-5 5M20 10H10a6 6 0 0 0-6 6v3",
  desktop: "M3 3h18v13H3zM8 21h8M12 16v5",
  tablet: "M5 2h14v20H5zM11 18h2",
  mobile: "M7 2h10v20H7zM11 18h2",
  close: "m6 6 12 12M6 18 18 6",
  up: "m6 14 6-6 6 6",
  down: "m6 10 6 6 6-6",
  duplicate: "M8 8h13v13H8zM16 8V3H3v13h5",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  image: "M3 3h18v18H3zM3 17l5-5 4 4 4-6 5 7M8 7h.01",
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  website: "M3 4h18v16H3zM3 9h18M7 6.5h.01M10 6.5h.01",
  members:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  user: "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M12 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  forms: "M6 3h12v18H6zM9 7h6M9 11h6M9 15h3",
  controls: "M4 7h9M17 7h3M4 17h3M11 17h9M13 4v6M7 14v6",
} as const;

export type IconName = keyof typeof paths;
export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
