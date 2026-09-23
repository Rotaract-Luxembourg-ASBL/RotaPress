import { CmsImage, SafeLink, type BlockProps } from "./block-renderers";
import { FeatureIcon } from "./feature-icon";

export function FeatureSectionBlock(props: BlockProps<"FeatureSection">) {
  return (
    <section
      className={`cms-block cms-feature-section cms-feature-image-${props.imagePosition}`}
    >
      {props.assetId && (
        <div className="cms-feature-media">
          <CmsImage id={props.assetId} alt={props.alt} />
        </div>
      )}
      <div className="cms-section-copy">
        {props.eyebrow && <p className="cms-eyebrow">{props.eyebrow}</p>}
        <h2>{props.title}</h2>
        {props.body && <p>{props.body}</p>}
        <ul className="cms-feature-list">
          {props.items.map((item, index) => (
            <li key={index}>
              <FeatureIcon name={item.icon} />
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
        {props.buttonLabel && (
          <SafeLink className="button button-accent" href={props.buttonHref}>
            {props.buttonLabel}
          </SafeLink>
        )}
      </div>
    </section>
  );
}

export function ProgrammeBlock(props: BlockProps<"Programme">) {
  return (
    <section className="cms-block cms-programme">
      <header className="cms-section-heading">
        <h2>{props.title}</h2>
        {props.introduction && <p>{props.introduction}</p>}
      </header>
      <ol className="cms-programme-list">
        {props.items.map((item, index) => (
          <li key={index}>
            <span className="cms-programme-time">{item.time}</span>
            <div>
              <h3>{item.title}</h3>
              {item.description && <p>{item.description}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ParticipationOptionsBlock(
  props: BlockProps<"ParticipationOptions">,
) {
  return (
    <section className="cms-block cms-participation">
      <header className="cms-section-heading">
        <h2>{props.title}</h2>
        {props.introduction && <p>{props.introduction}</p>}
      </header>
      <div className="cms-card-grid">
        {props.items.map((item, index) => (
          <article className="cms-card cms-option-card" key={index}>
            {item.badge && (
              <span className="cms-option-badge">{item.badge}</span>
            )}
            <h3>{item.title}</h3>
            {item.priceLabel && (
              <p className="cms-option-price">{item.priceLabel}</p>
            )}
            {item.description && <p>{item.description}</p>}
            <ul>
              {item.features.map((feature, i) => (
                <li key={i}>{feature.text}</li>
              ))}
            </ul>
            {item.buttonLabel && (
              <SafeLink
                className="button button-outline"
                href={item.buttonHref}
              >
                {item.buttonLabel}
              </SafeLink>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
