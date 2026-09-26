import { expect, it } from "vitest";
import type { CmsService } from "../../src/features/cms";
import type { Database } from "../../src/infrastructure/database/client";
import { FeatureService } from "../../src/core/features/FeatureService";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsData } from "../../src/features/cms/cms_schemas";

export function projectCmsChecks(
  get: () => {
    db: Database;
    cms: CmsService;
    authorization: AuthorizationService;
    installedClub: () => Promise<{ owner: TrustedActor }>;
  },
) {
  it("C03 keeps Projects menus deliberate and gates connected project publication", async () => {
    const { db, cms, authorization, installedClub } = get();
    const { owner } = await installedClub();
    const features = new FeatureService(db, authorization);
    let site = await cms.getSite(owner, "en");
    site = await cms.saveSite(owner, {
      locale: "en",
      expectedVersion: site.version,
      settings: {
        ...site.draft,
        navigation: [{ systemPage: "projects", label: "Our impact" }],
      },
    });
    expect((await cms.publicSite("en")).navigation).toEqual([]);
    await cms.publishSite(owner, {
      locale: "en",
      expectedVersion: site.version,
    });
    expect((await cms.publicSite("en")).navigation).toEqual([
      { label: "Our impact", href: "/projects" },
    ]);
    let page = await cms.create(owner, {
      kind: "page",
      title: "Our impact",
      slug: "impact",
      locale: "en",
    });
    const data: CmsData = {
      root: { props: {} },
      content: [
        {
          type: "ProjectCollection",
          props: {
            id: "projects",
            version: 1,
            title: "Our impact",
            introduction: "",
            status: "completed",
            limit: 6,
          },
        },
      ],
    };
    page = await cms.save(owner, {
      id: page.id,
      locale: "en",
      expectedRevisionId: page.draft.id,
      title: page.draft.title,
      slug: page.draft.slug,
      description: "",
      socialImageId: null,
      data,
    });
    await features.configure(owner, {
      key: "projects",
      enabled: false,
      expectedVersion: 0,
      confirmed: true,
    });
    expect((await cms.publicSite("en")).navigation).toEqual([]);
    await expect(
      cms.publish(owner, {
        id: page.id,
        locale: "en",
        expectedRevisionId: page.draft.id,
      }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await features.configure(owner, {
      key: "projects",
      enabled: true,
      expectedVersion: 1,
      confirmed: true,
    });
    expect((await cms.publicSite("en")).navigation).toEqual([
      { label: "Our impact", href: "/projects" },
    ]);
    await cms.publish(owner, {
      id: page.id,
      locale: "en",
      expectedRevisionId: page.draft.id,
    });
    expect((await cms.publicPage("en", "impact"))?.data.content[0]).toEqual(
      data.content[0],
    );
  });
}
