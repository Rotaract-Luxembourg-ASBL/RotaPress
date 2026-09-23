"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { kits, kitRecipes, type KitId } from "@/features/cms/kits/catalogue";
import type { CmsLocale } from "@/features/cms/cms_schemas";
import type { WebsiteWorkspace } from "@/features/cms/website_setup_schemas";
import { Dialog } from "./dialog";
import { Notice } from "./primitives";
import { errorMessage, request } from "./api";

export function WebsiteTemplateGallery({
  workspace,
  locale,
  disabled,
  onSelected,
}: {
  workspace: WebsiteWorkspace;
  locale: CmsLocale;
  disabled: boolean;
  onSelected: () => void;
}) {
  const [selected, setSelected] = useState<KitId>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function install() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await request("/api/admin/cms/website/template", {
        method: "POST",
        body: JSON.stringify({
          kitId: selected,
          locale,
          expectedVersion: workspace.site.version,
          confirmed: true,
        }),
      });
      setSelected(undefined);
      onSelected();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Website templates">
      <div className="website-section-heading">
        <h2>Choose your website template</h2>
        <p>
          Start with a complete website. Pages, menu, header, footer and design
          are set up together.
        </p>
      </div>
      {disabled && (
        <Notice kind="info">
          Save your website settings before choosing a template.
        </Notice>
      )}
      <div className="kit-catalogue">
        {Object.entries(kits).map(([id, kit]) => (
          <article className="panel kit-card" key={id}>
            <Image
              src={`/kit-previews/${id}.png`}
              width={1440}
              height={700}
              alt={`${kit.name} example homepage`}
              unoptimized
            />
            <div>
              {workspace.selection?.kitId === id && (
                <span className="website-state">
                  Selected for your draft website
                </span>
              )}
              <h3>{kit.name}</h3>
              <p>{kit.description}</p>
              <p className="field-help">
                {kit.websiteRecipes.length - 2} editable pages · Calendar &amp;
                events · Contact form · Team &amp; partners
              </p>
              <div className="cms-actions">
                <button
                  className="button button-accent"
                  disabled={disabled}
                  onClick={() => {
                    setError("");
                    setSelected(id as KitId);
                  }}
                >
                  Use {kit.name}
                </button>
                <Link
                  className="button button-outline"
                  href={`/admin/website/preview?template=${id}&locale=${locale}`}
                  target="_blank"
                >
                  Preview template
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      {selected && (
        <Dialog
          title={`Use ${kits[selected].name}`}
          onClose={() => setSelected(undefined)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            {error && <Notice>{error}</Notice>}
            <p>
              Set up this template as your draft website. You can edit every
              page before publishing.
            </p>
            <div className="website-included">
              {kits[selected].websiteRecipes.map((id) => (
                <span key={id}>
                  {kitRecipes.find((recipe) => recipe.id === id)?.name}
                </span>
              ))}
            </div>
            <p>
              The homepage, menu, header, footer and appearance will be selected
              together. Your current public website stays unchanged until you
              publish.
            </p>
            <p className="field-help">
              Existing pages remain in All saved pages. If you used this
              template before, your edited copies are kept.
            </p>
            <p className="field-help">
              A fresh setup includes the latest page layouts. Review and publish
              the contact form in Forms. Add activities in Calendar, publish
              events in Events, and publish team and partner profiles in
              Directory. These blocks use your own content; setup does not
              create activities or people.
            </p>
            <button
              className="button button-accent"
              disabled={busy}
              onClick={() => void install()}
            >
              {busy ? "Setting up website…" : "Set up my website"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
