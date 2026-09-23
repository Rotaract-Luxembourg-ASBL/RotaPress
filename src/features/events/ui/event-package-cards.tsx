import type { PublicPackage } from "../package_schemas";

export function packagePrice(
  priceMinor: number,
  currency: string,
  locale = "en",
) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    priceMinor / 100,
  );
}

export function EventPackageCards({
  items,
  preview = false,
  locale = "en",
}: {
  items: PublicPackage[];
  preview?: boolean;
  locale?: string;
}) {
  return (
    <div className="event-package-cards">
      {items.map((item) => (
        <article className="event-package-card" key={item.id}>
          <h3>{item.title}</h3>
          {item.description && <p>{item.description}</p>}
          {item.priceMinor !== null && item.currency && (
            <p className="event-package-price">
              {packagePrice(item.priceMinor, item.currency, locale)}
            </p>
          )}
          {item.checkoutUrl &&
            (preview ? (
              <button type="button" className="button button-accent" disabled>
                Continue to Luma
              </button>
            ) : (
              <a
                className="button button-accent"
                href={item.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                Continue to Luma
              </a>
            ))}
        </article>
      ))}
    </div>
  );
}
