import type { Config } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import { DesignFrame } from "./design-frame";

/** Decorate each registered block without changing its fields, slots or defaults. */
export function withDesign(config: Config<PuckBlocks>): Config<PuckBlocks> {
  function component<K extends keyof PuckBlocks>(
    key: K,
  ): Config<PuckBlocks>["components"][K] {
    const original = config.components[key];
    const Render = original.render;
    return {
      ...original,
      render: (props) => (
        <DesignFrame design={props.design}>
          <Render {...props} />
        </DesignFrame>
      ),
    };
  }
  // Object.fromEntries loses the mapped key relation; keys are exactly the existing registry.
  const components = Object.fromEntries(
    (Object.keys(config.components) as (keyof PuckBlocks)[]).map((key) => [
      key,
      component(key),
    ]),
  ) as Config<PuckBlocks>["components"];
  return { ...config, components };
}
