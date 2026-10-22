"use client";

import { useEffect, useRef, useState } from "react";

// The newsletter exactly as it was emailed, sized to its content (and
// re-sized as its images load).
export default function IssueFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState(1200);

  // The frame can finish loading before React attaches onLoad (it's in the
  // server HTML), so also set up once on mount.
  useEffect(() => {
    if (ref.current?.contentDocument?.readyState === "complete") setup();
    return () => observer.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function measure() {
    const doc = ref.current?.contentDocument;
    if (!doc) return;
    setHeight(Math.ceil(Math.max(doc.body?.offsetHeight || 0, doc.documentElement.scrollHeight)) + 4);
  }

  function setup() {
    measure();
    const body = ref.current?.contentDocument?.body;
    if (body && typeof ResizeObserver !== "undefined") {
      observer.current?.disconnect();
      observer.current = new ResizeObserver(measure);
      observer.current.observe(body);
    }
    ref.current?.contentDocument?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
  }

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={html}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={setup}
      style={{ height }}
      scrolling="no"
      className="block w-full overflow-hidden bg-[#07080d]"
    />
  );
}
