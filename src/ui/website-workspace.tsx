"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CmsLocale } from "@/features/cms/cms_schemas";
import type { WebsiteWorkspace as Workspace } from "@/features/cms/website_setup_schemas";
import { websiteThemes } from "@/features/cms/appearance";
import { kits } from "@/features/cms/kits/catalogue";
import { useResource } from "./api";
import { Loading, Notice, PageHeading } from "./primitives";
import { useCurrentUser } from "./admin-shell";
import {
  WebsiteSettings,
  type WebsiteSettingsPanel,
} from "./site-settings-panel";
import { WebsiteContentList } from "./website-panel";
import { WebsiteTemplateGallery } from "./website-template-gallery";
import { WebsiteConnectedContent } from "./website-connected-content";
import {
  WebsitePublication,
  websitePublicationItems,
} from "./website-publication";
import { Icon, type IconName } from "./icon";

const tabs: { id: string; label: string; icon: IconName }[] = [
  { id: "overview", label: "Your website", icon: "website" },
  { id: "pages", label: "Pages", icon: "forms" },
  { id: "menus", label: "Menus", icon: "outline" },
  { id: "parts", label: "Header & footer", icon: "settings" },
  { id: "appearance", label: "Branding & appearance", icon: "controls" },
  { id: "seo", label: "Search & sharing", icon: "website" },
  { id: "templates", label: "Templates", icon: "image" },
  { id: "sections", label: "Reusable sections", icon: "duplicate" },
];

function WebsiteLocale({ locale, tab }: { locale: CmsLocale; tab: string }) {
  const { data, error, refresh } = useResource<Workspace>(
    "/api/admin/cms/website?locale=" + locale,
  );
  const { capabilities } = useCurrentUser();
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [review, setReview] = useState<Workspace>();
  const [message, setMessage] = useState("");
  useEffect(() => {
    const focus = () => {
      if (!dirty) refresh();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [dirty, refresh]);
  const settingsPanel = ["menus", "parts", "appearance", "seo"].includes(tab);
  function navigate(id: string) {
    router.push("/admin/website?tab=" + id + "&locale=" + locale);
  }
  function canLeave() {
    return (
      !dirty || window.confirm("Leave without saving your website settings?")
    );
  }
  const publishItems = data ? websitePublicationItems(data) : [];
  const published = Boolean(data?.site.published);
  const changes = Boolean(
    data &&
    (JSON.stringify(data.site.draft) !== JSON.stringify(data.site.published) ||
      publishItems.some(
        (item) => item.draftRevisionId !== item.publishedRevisionId,
      )),
  );
  const currentTemplate = data?.selection?.kitId;
  return (
    <div className="website-workspace">
      <PageHeading
        title="Website"
        description="Your pages, menu, branding and design, together."
      >
        <div className="cms-actions">
          {data?.site.draft.homePageId && (
            <Link
              className="button button-outline"
              href={"/admin/website/preview?locale=" + locale}
              target="_blank"
            >
              Preview website
            </Link>
          )}
          {capabilities.includes("cms.publish") && (
            <button
              className="button button-accent"
              disabled={
                !data ||
                dirty ||
                !data.site.version ||
                !publishItems.length ||
                !changes
              }
              onClick={() => setReview(data)}
            >
              Publish website
            </button>
          )}
        </div>
      </PageHeading>
      <div className="website-workspace-grid">
        <aside className="website-sidebar">
          <nav className="admin-section-nav" aria-label="Website management">
            {tabs.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => navigate(item.id)}
              >
                <Icon name={item.icon} />
                {item.label}
              </button>
            ))}
          </nav>
          <label>
            Website language
            <select
              value={locale}
              onChange={(e) => {
                if (
                  dirty &&
                  !window.confirm(
                    "Switch language and leave unsaved website settings?",
                  )
                )
                  return;
                router.push(
                  "/admin/website?tab=" + tab + "&locale=" + e.target.value,
                );
              }}
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="lb">Luxembourgish</option>
            </select>
          </label>
          <p className="field-help">
            Save to keep working privately. Publish when your website is ready.
          </p>
          <Link href="/" target="_blank">
            View published website ↗
          </Link>
        </aside>
        <div className="website-workspace-content">
          {error && (
            <Notice>
              {error}{" "}
              <button className="inline-button" onClick={refresh}>
                Try again
              </button>
            </Notice>
          )}
          {message && <Notice kind="success">{message}</Notice>}
          {dirty && (
            <Notice kind="info">
              You have unsaved settings. Return to Menus, Header &amp; footer or
              Branding &amp; appearance to save.
            </Notice>
          )}
          {!data && !error && <Loading />}
          {data && (
            <>
              {tab === "overview" && (
                <>
                  <section className="panel website-overview">
                    <div>
                      <span className="website-state">
                        {changes
                          ? "Draft changes to review"
                          : published
                            ? "Website published"
                            : "Website draft"}
                      </span>
                      <h2>
                        {currentTemplate
                          ? kits[currentTemplate].name
                          : "Your current website"}
                      </h2>
                      <p>
                        {currentTemplate
                          ? "Your template is ready to customise. Edit its pages, menu and design using the menu on the left."
                          : "Choose a complete template to set up your pages, menu, header, footer and appearance in one step."}
                      </p>
                      <div className="cms-actions">
                        <button
                          className="button button-accent"
                          onClick={() =>
                            navigate(currentTemplate ? "pages" : "templates")
                          }
                        >
                          {currentTemplate ? "Edit pages" : "Choose a template"}
                        </button>
                        <button
                          className="button button-outline"
                          onClick={() =>
                            navigate(currentTemplate ? "templates" : "pages")
                          }
                        >
                          {currentTemplate
                            ? "Change template"
                            : "Manage existing pages"}
                        </button>
                      </div>
                      <p className="field-help">
                        Published appearance:{" "}
                        {data.site.published
                          ? websiteThemes[data.site.published.themeId].name
                          : "Not published yet"}
                      </p>
                    </div>
                    {currentTemplate && (
                      <Image
                        src={"/kit-previews/" + currentTemplate + ".png"}
                        alt={kits[currentTemplate].name + " example design"}
                        width={1440}
                        height={700}
                        unoptimized
                      />
                    )}
                  </section>
                  <div className="website-task-grid">
                    {[
                      {
                        id: "pages",
                        title: "Write your pages",
                        text: "Replace the starting text, add images and arrange your content.",
                      },
                      {
                        id: "menus",
                        title: "Guide your visitors",
                        text: "Choose your homepage and order the links in your menu.",
                      },
                      {
                        id: "appearance",
                        title: "Make it your club",
                        text: "Choose a shared logo, browser icon and colors for pages, forms and sign-in.",
                      },
                    ].map((item) => (
                      <button
                        key={item.id}
                        className="panel website-task"
                        onClick={() => navigate(item.id)}
                      >
                        <strong>{item.title}</strong>
                        <span>{item.text}</span>
                        <span>Open →</span>
                      </button>
                    ))}
                  </div>
                  <WebsiteConnectedContent
                    contactFormId={data.site.draft.contactFormId}
                  />
                </>
              )}
              {(tab === "pages" || tab === "sections") && (
                <WebsiteContentList
                  key={tab}
                  contents={data.contents}
                  selectedIds={data.selection?.contentIds ?? null}
                  kitId={currentTemplate}
                  kind={tab === "sections" ? "section" : "page"}
                  locale={locale}
                  homePageId={data.site.draft.homePageId}
                  canLeave={canLeave}
                />
              )}
              <div hidden={!settingsPanel}>
                <WebsiteSettings
                  site={data.site}
                  items={data.contents}
                  locale={locale}
                  panel={
                    settingsPanel ? (tab as WebsiteSettingsPanel) : "menus"
                  }
                  onSaved={() => {
                    setDirty(false);
                    refresh();
                  }}
                  onDirtyChange={setDirty}
                />
              </div>
              {tab === "templates" && (
                <WebsiteTemplateGallery
                  workspace={data}
                  locale={locale}
                  disabled={dirty}
                  onSelected={() => {
                    refresh();
                    setMessage(
                      "Template selected. Your draft website is ready to edit and preview.",
                    );
                    navigate("overview");
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
      {review && (
        <WebsitePublication
          workspace={review}
          locale={locale}
          initialScope={
            tab === "menus" && review.site.published ? "menu" : "website"
          }
          onClose={() => setReview(undefined)}
          onPublished={(scope) => {
            refresh();
            window.dispatchEvent(new Event("website-published"));
            setMessage(
              scope === "menu"
                ? "Menu published. Your other saved changes remain drafts."
                : "Website published. Visitors now see your saved pages, menu and design.",
            );
          }}
        />
      )}
    </div>
  );
}

export function WebsiteWorkspace() {
  const query = useSearchParams();
  const rawLocale = query.get("locale");
  const locale: CmsLocale =
    rawLocale === "fr" || rawLocale === "lb" ? rawLocale : "en";
  const tab = tabs.some((item) => item.id === query.get("tab"))
    ? query.get("tab")!
    : "overview";
  return <WebsiteLocale key={locale} locale={locale} tab={tab} />;
}
