"use client";

import { useEffect } from "react";

/**
 * Jotform iframe embed with Jotform's resize handler, which keeps the iframe's
 * height in step with the form (validation errors, multi-page, thank-you
 * screen). The handler script loads once and is shared by every embed on the
 * page. The original snippet's `window.parent.scrollTo(0,0)` on load is
 * deliberately dropped: the form sits mid-page here, and yanking the visitor
 * to the top would be a bug, not a feature.
 */

declare global {
  interface Window {
    jotformEmbedHandler?: (selector: string, base: string) => void;
  }
}

const HANDLER_SRC = "https://cdn.jotfor.ms/s/umd/latest/for-form-embed-handler.js";

export function JotformEmbed({
  formId,
  title,
}: {
  formId: string;
  /** Accessible name for the iframe. */
  title: string;
}) {
  useEffect(() => {
    const init = () =>
      window.jotformEmbedHandler?.(
        `iframe[id='JotFormIFrame-${formId}']`,
        "https://form.jotform.com/",
      );

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${HANDLER_SRC}"]`,
    );
    if (existing) {
      if (window.jotformEmbedHandler) init();
      else existing.addEventListener("load", init);
      return () => existing.removeEventListener("load", init);
    }

    const script = document.createElement("script");
    script.src = HANDLER_SRC;
    script.async = true;
    script.addEventListener("load", init);
    document.body.appendChild(script);
    return () => script.removeEventListener("load", init);
  }, [formId]);

  return (
    <iframe
      id={`JotFormIFrame-${formId}`}
      title={title}
      allow="geolocation; microphone; camera; fullscreen; payment"
      src={`https://form.jotform.com/${formId}`}
      className="-ml-6 border-0"
      style={{
        width: "calc(100% + 3rem)",
        minWidth: "calc(100% + 3rem)",
        maxWidth: "none",
        height: "539px",
      }}
      scrolling="no"
    />
  );
}
