import type { CmsData, Block } from "../cms_schemas";
import {
  block,
  document,
  linkButton,
  text,
  type RecipeContext,
} from "./recipe_helpers";

export function siteRecipe(
  kind: "header" | "footer",
  context: RecipeContext,
): CmsData {
  const action = context.kit === "rotaract-action";
  const brand = () =>
    block("SiteBrand", {
      assetId: "",
      templateBrand: action ? "rotaract" : "rotary",
      alt: "",
      label: "",
      logoSize: "large",
      showName: true,
    });
  const menu = (vertical = false) =>
    block("SiteMenu", {
      menuKey: "primary",
      label: vertical ? "Explore" : "Menu",
      layout: vertical ? "vertical" : "horizontal",
    });
  const contact = block("SiteContact", {
    title: "Start a conversation",
    email: "",
    phone: "",
    address: "",
  });
  const join = linkButton(
    action ? "Join our next activity" : "Get involved",
    (action ? context.links?.events : context.links?.join) || "/membership",
  );
  const login = linkButton("Member login", "/sign-in?next=/membership", true);
  const content: Block[] =
    kind === "header"
      ? [
          block("SiteRow", {
            layout: "wide-center",
            flow: "row",
            spacing: "compact",
            left: [brand()],
            center: [menu()],
            right: [login, join],
          }),
        ]
      : [
          ...(action
            ? [
                block("Heading", {
                  text: "Good company. Shared purpose.",
                  level: "h2",
                }),
              ]
            : []),
          block("SiteRow", {
            layout: action ? "balanced" : "wide-left",
            flow: "columns",
            spacing: "comfortable",
            left: [
              brand(),
              text(
                action
                  ? "<p>Connect, learn and take action together.</p>"
                  : "<p>People united by a willingness to serve.<br />Discover what we can do together.</p>",
              ),
              block("SiteSocial", { label: "Follow the club" }),
            ],
            center: [
              block("Heading", { text: "Explore", level: "h2" }),
              menu(true),
              ...(["team", "partners", "gallery"] as const).flatMap((recipe) =>
                context.links?.[recipe]
                  ? [
                      linkButton(
                        {
                          team: "Our team",
                          partners: "Partners & sponsors",
                          gallery: "Gallery",
                        }[recipe],
                        context.links[recipe],
                        true,
                      ),
                    ]
                  : [],
              ),
            ],
            right: [
              contact,
              ...(context.links?.contact
                ? [linkButton("Contact the club", context.links.contact, true)]
                : []),
              login,
              linkButton("My registrations", "/registrations", true),
            ],
          }),
          block("SiteFooterText", {}),
          text("<p>Made with RotaPress</p>"),
        ];
  return document(context, content);
}
