import type { ReactNode } from "react";
import type { BlockDesign } from "../block_design";

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
    >
      {children}
    </div>
  );
}
