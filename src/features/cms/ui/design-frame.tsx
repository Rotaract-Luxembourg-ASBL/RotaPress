import type { ReactNode } from "react";
import type { BlockDesign } from "../block_design";

function presentationAttributes(design: BlockDesign) {
  const names = [
    "textSize",
    "lineHeight",
    "imageFit",
    "imageRatio",
    "imagePosition",
  ] as const;
  return Object.fromEntries(
    (["base", "tablet", "mobile"] as const).flatMap((screen) => {
      const values = screen === "base" ? design : design.responsive?.[screen];
      return names.map((key) => [
        `data-${screen === "base" ? "" : `${screen}-`}${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        values?.[key],
      ]);
    }),
  );
}

export function DesignFrame({
  design,
  children,
  id,
}: {
  design?: BlockDesign;
  children: ReactNode;
  id?: string;
}) {
  if (!design || !Object.keys(design).length)
    return id ? (
      <div id={id} className="event-section-anchor">
        {children}
      </div>
    ) : (
      <>{children}</>
    );
  return (
    <div
      id={id}
      className="cms-design"
      data-tone={design.tone}
      data-spacing={design.spacing}
      data-content-width={design.width}
      data-alignment={design.alignment}
      data-corners={design.corners}
      data-columns={design.columns}
      data-tablet-spacing={design.responsive?.tablet?.spacing}
      data-tablet-width={design.responsive?.tablet?.width}
      data-tablet-alignment={design.responsive?.tablet?.alignment}
      data-tablet-columns={design.responsive?.tablet?.columns}
      data-mobile-spacing={design.responsive?.mobile?.spacing}
      data-mobile-width={design.responsive?.mobile?.width}
      data-mobile-alignment={design.responsive?.mobile?.alignment}
      data-mobile-columns={design.responsive?.mobile?.columns}
      {...presentationAttributes(design)}
    >
      {children}
    </div>
  );
}
