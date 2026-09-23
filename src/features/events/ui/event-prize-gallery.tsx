import type { PublicPrize } from "../prize_schemas";
import { CmsImage, SafeLink } from "@/features/cms/ui/block-renderers";

export function EventPrizeGallery({ items }: { items: PublicPrize[] }) {
  return (
    <div className="event-prize-gallery">
      {items.map((item) => (
        <article className="event-prize-card" key={item.id}>
          {item.imageId && (
            <CmsImage
              id={item.imageId}
              alt={item.alt}
              className="event-prize-image"
            />
          )}
          <div className="event-prize-card-content">
            <h3>{item.title}</h3>
            {item.description && (
              <p className="event-prize-description">{item.description}</p>
            )}
            <p className="event-prize-quantity">Quantity: {item.quantity}</p>
            {item.partner && (
              <div className="event-prize-donor">
                <span className="small muted">Donor or sponsor</span>
                <SafeLink
                  href={item.partner.website}
                  className="event-prize-donor-link"
                >
                  {item.partner.logoId && (
                    <CmsImage id={item.partner.logoId} alt="" />
                  )}
                  <strong>{item.partner.name}</strong>
                </SafeLink>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
