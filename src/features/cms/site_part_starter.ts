import type { CmsData } from "./cms_schemas";

/** Copy the current shell's roles, referencing central identity/menu/footer data. */
export function sitePartStarter(kind: "header" | "footer"): CmsData {
  const base = () => ({ id: crypto.randomUUID(), version: 1 as const });
  return {
    root: { props: {} },
    content: [
      {
        type: "SiteRow",
        props: {
          ...base(),
          layout: "wide-center",
          flow: kind === "header" ? "row" : "columns",
          spacing: "comfortable",
          left:
            kind === "header"
              ? [
                  {
                    type: "SiteBrand",
                    props: {
                      ...base(),
                      assetId: "",
                      alt: "",
                      label: "",
                      logoSize: "medium",
                      showName: true,
                    },
                  },
                ]
              : [{ type: "SiteFooterText", props: base() }],
          center:
            kind === "header"
              ? [
                  {
                    type: "SiteMenu",
                    props: {
                      ...base(),
                      menuKey: "primary",
                      label: "Website navigation",
                      layout: "horizontal",
                    },
                  },
                ]
              : [
                  {
                    type: "SiteSocial",
                    props: { ...base(), label: "Social links" },
                  },
                ],
          right:
            kind === "header"
              ? [
                  {
                    type: "Button",
                    props: {
                      ...base(),
                      label: "Member login",
                      href: "/sign-in?next=/membership",
                      style: "outline",
                      alignment: "right",
                    },
                  },
                ]
              : [
                  {
                    type: "Button",
                    props: {
                      ...base(),
                      label: "Administration",
                      href: "/admin",
                      style: "outline",
                      alignment: "left",
                    },
                  },
                  {
                    type: "RichText",
                    props: { ...base(), text: "<p>Made with RotaPress</p>" },
                  },
                ],
        },
      },
    ],
  };
}
