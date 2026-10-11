import type { BlockProps } from "../../src/features/cms/ui/block-renderers";

/** Synthetic local content; the caller supplies an authorized fixture image. */
export function featureBackgroundProps(
  assetId: string,
): BlockProps<"FeatureSection"> {
  return {
    id: "membership-background",
    version: 1,
    layout: "background",
    eyebrow: "Ready to contribute?",
    title: "Find your place in the community",
    body: "Bring your ideas, develop your skills and build friendships through service.",
    assetId,
    alt: "Synthetic community artwork",
    imagePosition: "left",
    items: [
      { title: "Develop leadership", text: "", icon: "spark" },
      { title: "Build connections", text: "", icon: "people" },
      { title: "Serve the community", text: "", icon: "heart" },
      { title: "Meet a global network", text: "", icon: "globe" },
    ],
    buttonLabel: "Join the community",
    buttonHref: "/membership",
  };
}
