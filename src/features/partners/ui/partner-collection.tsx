import type { PublicPartner } from "../partner_schemas";
import { CmsImage, SafeLink } from "../../cms/ui/block-renderers";

export function PartnerCollection({
  title,
  presentation,
  items,
}: {
  title: string;
  presentation: "logos" | "cards";
  items: PublicPartner[];
}) {
  if (!items.length) return null;
  return (
    <section
      className="cms-block cms-partners"
      data-presentation={presentation}
    >
      {title && <h2>{title}</h2>}
      <div className="cms-card-grid">
        {items.map((item) => (
          <article className="cms-partner" key={item.id}>
            <SafeLink href={item.website} className="cms-partner-link">
              {item.logoId && <CmsImage id={item.logoId} alt="" />}
              <h3>{item.name}</h3>
            </SafeLink>
            {presentation === "cards" && (
              <>
                <span className="cms-partner-category">
                  {item.category === "team"
                    ? item.role || "Team member"
                    : item.category === "partner"
                      ? "Partner"
                      : "Sponsor"}
                </span>
                <p>{item.description}</p>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
