import "server-only";
import { CalendarPublicBlock } from "./calendar-public-block";
import { services } from "@/composition/services";
import { PageIntroBlock, PageCollectionBlock } from "./page-collection";
import type { PageCard } from "../page_collection";
import type { PublicEventCard } from "../../events/event_catalogue";
import type { EventFields } from "../../events/event_schemas";
import {
  eventSectionAnchor,
  eventPageNavigation,
} from "../../events/event_sections";
import {
  EventFooterBlock,
  EventHeroBlock,
  EventImpactBlock,
  EventPracticalBlock,
} from "../../events/ui/event-reference-blocks";
import { EventCards } from "../../events/ui/event-cards";

import type { CmsData, CmsLocale } from "../cms_schemas";
import { HeroSliderBlock } from "./hero-slider";
import {
  FeatureSectionBlock,
  ProgrammeBlock,
  ParticipationOptionsBlock,
} from "./section-renderers";
import { PublicEventCollection } from "./event-collection-public";
import {
  EventContactBlock,
  EventFlyerBlock,
  EventShareBlock,
} from "../../events/ui/event-content-blocks";
import type { PublicPartner } from "../../partners/partner_schemas";
import { PartnerCollection } from "../../partners/ui/partner-collection";
import { selectProfiles } from "../../partners/collection_selection";
import { DesignFrame } from "./design-frame";
import {
  CallToActionBlock,
  CardsBlock,
  FaqBlock,
  GalleryBlock,
  HeroBlock,
  ImageBlock,
  SponsorsBlock,
  StatisticsBlock,
  TeamBlock,
} from "./block-renderers";
import {
  ButtonBlock,
  CoverBlock,
  DividerBlock,
  HeadingBlock,
  SpacerBlock,
} from "./basic-block-renderers";
import { ImageSliderBlock } from "./image-slider";
import { PublicForm } from "@/features/forms/ui/public-form";
import { FormEditorPreview } from "./form-block";
import { EventRegistrationPreview } from "./event-registration-block";
import { EventPackagesPreview } from "./event-packages-block";
import { EventPackagesBlock } from "./event-packages-public";
import { EventPrizesPreview } from "./event-prizes-block";
import { EventPrizesBlock } from "./event-prizes-public";
import { EventWinnersPreview } from "./event-winners-block";
import { EventWinnersBlock } from "./event-winners-public";
import {
  EventFormBlock,
  EventRegistrationBlock,
} from "./event-participation-public";
import {
  SiteBrandBlock,
  SiteMenuBlock,
  SiteContactBlock,
  SiteSocialBlock,
  SiteFooterTextBlock,
  SiteRowBlock,
} from "./site-part-blocks";

/** Only render validated, sanitized DTOs returned by the CMS service. */
export async function RenderContent({
  data,
  sections = {},
  preview = false,
  partners = {},
  locale = "en",
  previewCards,
  previewEvents,
  eventId,
  eventShareUrl,
  eventDetails,
}: {
  data: CmsData;
  sections?: Record<string, CmsData>;
  preview?: boolean;
  partners?: Record<string, PublicPartner>;
  locale?: CmsLocale;
  previewCards?: PageCard[];
  previewEvents?: PublicEventCard[];
  eventId?: string;
  eventShareUrl?: string;
  eventDetails?: EventFields;
}) {
  const cards = data.content.some((block) => block.type === "PageCollection")
    ? (previewCards ?? (await services.cms.publicPageCards(locale)))
    : [];
  return (
    <>
      {data.content.map((block) => (
        <DesignFrame
          key={block.props.id}
          design={block.props.design}
          id={eventId ? eventSectionAnchor(block.props.id) : undefined}
        >
          {(() => {
            const key = block.props.id;
            switch (block.type) {
              case "Calendar":
                return <CalendarPublicBlock {...block.props} />;
              case "EventHero":
                return eventId ? (
                  <EventHeroBlock
                    {...block.props}
                    event={eventDetails}
                    locale={locale}
                    preview={preview}
                  />
                ) : null;
              case "EventPractical":
                return eventId ? (
                  <EventPracticalBlock
                    {...block.props}
                    event={eventDetails}
                    locale={locale}
                  />
                ) : null;
              case "EventImpact":
                return eventId ? <EventImpactBlock {...block.props} /> : null;
              case "EventFooter":
                return eventId ? (
                  <EventFooterBlock
                    {...block.props}
                    event={eventDetails}
                    navigation={eventPageNavigation(data)}
                  />
                ) : null;
              case "EventPrizes":
                return eventId ? (
                  preview ? (
                    <EventPrizesPreview
                      eventId={eventId}
                      title={block.props.title}
                    />
                  ) : (
                    <EventPrizesBlock
                      eventId={eventId}
                      title={block.props.title}
                    />
                  )
                ) : null;
              case "EventWinners":
                return eventId ? (
                  preview ? (
                    <EventWinnersPreview
                      eventId={eventId}
                      title={block.props.title}
                    />
                  ) : (
                    <EventWinnersBlock
                      eventId={eventId}
                      title={block.props.title}
                    />
                  )
                ) : null;
              case "EventPackages":
                return eventId ? (
                  preview ? (
                    <EventPackagesPreview
                      eventId={eventId}
                      title={block.props.title}
                    />
                  ) : (
                    <EventPackagesBlock
                      eventId={eventId}
                      title={block.props.title}
                      locale={locale}
                    />
                  )
                ) : null;
              case "EventContact":
                return eventId ? <EventContactBlock {...block.props} /> : null;
              case "EventFlyer":
                return eventId ? <EventFlyerBlock {...block.props} /> : null;
              case "EventShare":
                return eventId ? (
                  <EventShareBlock
                    title={block.props.title}
                    url={preview ? undefined : eventShareUrl}
                    preview={preview}
                  />
                ) : null;
              case "PageIntro":
                return <PageIntroBlock {...block.props} />;
              case "Columns":
                return (
                  <section
                    className={`cms-block cms-columns cms-columns-${block.props.ratio}`}
                  >
                    {[block.props.left, block.props.right].map(
                      (content, index) => (
                        <div key={index}>
                          <RenderContent
                            data={{ root: { props: {} }, content }}
                            preview={preview}
                            sections={sections}
                            partners={partners}
                            locale={locale}
                            previewCards={previewCards}
                            previewEvents={previewEvents}
                          />
                        </div>
                      ),
                    )}
                  </section>
                );
              case "PageCollection":
                return (
                  <PageCollectionBlock
                    {...block.props}
                    items={block.props.pageIds.flatMap(
                      (id) => cards.find((item) => item.id === id) ?? [],
                    )}
                  />
                );
              case "HeroSlider":
                return <HeroSliderBlock {...block.props} />;
              case "FeatureSection":
                return <FeatureSectionBlock {...block.props} />;
              case "Programme":
                return <ProgrammeBlock {...block.props} />;
              case "ParticipationOptions":
                return <ParticipationOptionsBlock {...block.props} />;
              case "EventCollection":
                if (preview && previewEvents)
                  return block.props.period === "past" ? null : (
                    <section className="cms-block cms-event-collection">
                      <header className="cms-section-heading">
                        <h2>{block.props.title}</h2>
                      </header>
                      <EventCards
                        items={previewEvents.slice(0, block.props.limit)}
                        locale={locale}
                        layout={block.props.layout}
                      />
                    </section>
                  );
                return (
                  <PublicEventCollection {...block.props} locale={locale} />
                );
              case "SiteBrand":
                return <SiteBrandBlock key={key} {...block.props} />;
              case "SiteMenu":
                return <SiteMenuBlock key={key} {...block.props} />;
              case "SiteContact":
                return <SiteContactBlock key={key} {...block.props} />;
              case "SiteSocial":
                return <SiteSocialBlock key={key} {...block.props} />;
              case "SiteFooterText":
                return <SiteFooterTextBlock key={key} />;
              case "SiteRow":
                return (
                  <SiteRowBlock
                    key={key}
                    {...block.props}
                    left={
                      <RenderContent
                        data={{
                          root: { props: {} },
                          content: block.props.left,
                        }}
                        preview={preview}
                      />
                    }
                    center={
                      <RenderContent
                        data={{
                          root: { props: {} },
                          content: block.props.center,
                        }}
                        preview={preview}
                      />
                    }
                    right={
                      <RenderContent
                        data={{
                          root: { props: {} },
                          content: block.props.right,
                        }}
                        preview={preview}
                      />
                    }
                  />
                );
              case "Form":
                return preview ? (
                  <FormEditorPreview
                    key={key}
                    formId={block.props.formId}
                    eventId={eventId}
                  />
                ) : eventId ? (
                  <EventFormBlock
                    eventId={eventId}
                    formId={block.props.formId}
                  />
                ) : (
                  <PublicForm key={key} formId={block.props.formId} />
                );
              case "EventRegistration":
                return eventId ? (
                  preview ? (
                    <EventRegistrationPreview eventId={eventId} />
                  ) : (
                    <EventRegistrationBlock eventId={eventId} locale={locale} />
                  )
                ) : null;
              case "Hero":
                return <HeroBlock key={key} {...block.props} />;
              case "Heading":
                return <HeadingBlock key={key} {...block.props} />;
              case "Button":
                return <ButtonBlock key={key} {...block.props} />;
              case "Divider":
                return <DividerBlock key={key} {...block.props} />;
              case "Spacer":
                return <SpacerBlock key={key} {...block.props} />;
              case "Cover":
                return <CoverBlock key={key} {...block.props} />;
              case "ImageSlider":
                return <ImageSliderBlock key={key} {...block.props} />;
              case "RichText":
                return (
                  <section
                    key={key}
                    className="cms-block cms-richtext"
                    dangerouslySetInnerHTML={{ __html: block.props.text }}
                  />
                );
              case "Image":
                return <ImageBlock key={key} {...block.props} />;
              case "Gallery":
                return <GalleryBlock key={key} {...block.props} />;
              case "Cards":
                return <CardsBlock key={key} {...block.props} />;
              case "Statistics":
                return <StatisticsBlock key={key} {...block.props} />;
              case "CallToAction":
                return <CallToActionBlock key={key} {...block.props} />;
              case "FAQ":
                return <FaqBlock key={key} {...block.props} />;
              case "Team":
                return <TeamBlock key={key} {...block.props} />;
              case "Sponsors":
                return <SponsorsBlock key={key} {...block.props} />;
              case "PartnerCollection":
                return (
                  <>
                    <PartnerCollection
                      title={block.props.title}
                      presentation={block.props.presentation}
                      items={selectProfiles(
                        block.props,
                        Object.values(partners),
                      )}
                    />
                    {preview &&
                      block.props.selectionMode !== "category" &&
                      block.props.partnerIds.some((id) => !partners[id]) && (
                        <p className="field-help">
                          A selected profile is not published. Publish it in
                          Community directory before publishing this page.
                        </p>
                      )}
                  </>
                );
              case "SharedSection":
                return sections[block.props.sectionId] ? (
                  <RenderContent
                    key={key}
                    data={sections[block.props.sectionId]}
                    partners={partners}
                    locale={locale}
                    preview={preview}
                  />
                ) : null;
            }
          })()}
        </DesignFrame>
      ))}
    </>
  );
}
