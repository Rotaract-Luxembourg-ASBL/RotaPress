"use client";

import { useState } from "react";
import type { BlockProps } from "./block-renderers";
import { customCodeDocument } from "../custom_code";

export function CustomCodeBlock(props: BlockProps<"CustomCode">) {
  return (
    <iframe
      className="cms-custom-code"
      title={props.title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      loading="lazy"
      height={props.height}
      srcDoc={customCodeDocument(props.html, props.css, props.javascript)}
    />
  );
}

export function CustomCodePreview(props: BlockProps<"CustomCode">) {
  const [running, setRunning] = useState(false);
  return (
    <section className="cms-block custom-code-preview">
      <p>
        Custom code runs in its own frame. It cannot access the editor, your
        session or club records. External scripts, requests and form submissions
        are blocked.
      </p>
      <button
        type="button"
        className="button button-outline"
        onClick={() => setRunning(!running)}
      >
        {running ? "Stop code preview" : "Run code preview"}
      </button>
      {running && <CustomCodeBlock {...props} />}
    </section>
  );
}
