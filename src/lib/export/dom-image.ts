"use client";

export type RenderPngOptions = {
  scale?: number;
  bgcolor?: string;
};

/**
 * Renders an element to a PNG data URL using dom-to-image-more, which handles
 * modern CSS (including lab() colors) better than html2canvas. The element is
 * cloned and problematic data-URI backgrounds/SVGs are stripped before render
 * to avoid fetch errors during image generation.
 */
export async function renderElementToPngDataUrl(
  element: HTMLElement,
  options: RenderPngOptions = {},
): Promise<string> {
  const { scale = 2 } = options;

  if (!element) {
    throw new Error("Image export target element is not available");
  }

  // @ts-expect-error - no types available for this package
  const domtoimage = await import("dom-to-image-more");

  const clonedElement = element.cloneNode(true) as HTMLElement;

  // Drop interactive UI, color swatches, and duplicate chrome from the clone.
  clonedElement.querySelectorAll("[data-export-hide], .export-color-swatch").forEach((node) => node.remove());

  const svgElements = clonedElement.querySelectorAll('svg[style*="data:image"]');
  svgElements.forEach((svg) => svg.remove());

  const allElements = clonedElement.querySelectorAll("*");
  allElements.forEach((el) => {
    if (el instanceof HTMLElement) {
      const style = el.getAttribute("style");
      if (style && style.includes("data:image")) {
        el.style.backgroundImage = "none";
      }
    }
  });

  const captureWidth = Math.max(element.offsetWidth, 960);
  clonedElement.style.width = `${captureWidth}px`;
  clonedElement.style.minWidth = `${captureWidth}px`;
  clonedElement.style.boxSizing = "border-box";
  clonedElement.style.position = "absolute";
  clonedElement.style.left = "-9999px";
  document.body.appendChild(clonedElement);

  try {
    const bgcolor =
      options.bgcolor ?? getComputedStyle(document.body).backgroundColor ?? "#ffffff";

    const imageData: string = await domtoimage.toPng(clonedElement, {
      bgcolor,
      quality: 1,
      width: captureWidth * scale,
      height: element.scrollHeight * scale,
      style: {
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        width: `${captureWidth}px`,
        height: `${element.scrollHeight}px`,
        position: "static",
        left: "auto",
      },
      cacheBust: false,
      filter: (node: Node) => {
        if (node instanceof HTMLElement) {
          const tagName = node.tagName?.toLowerCase();
          if (tagName === "script" || tagName === "style") {
            return false;
          }
        }
        return true;
      },
    });

    if (!imageData.startsWith("data:image/png")) {
      throw new Error("Image export expected a PNG data URL");
    }

    return imageData;
  } finally {
    if (document.body.contains(clonedElement)) {
      document.body.removeChild(clonedElement);
    }
  }
}

function getTimestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export type ExportPngOptions = RenderPngOptions & {
  fileName?: string;
};

/**
 * Renders an element to PNG and triggers a browser download.
 */
export async function exportElementToPng(
  element: HTMLElement,
  options: ExportPngOptions = {},
): Promise<void> {
  const imageData = await renderElementToPngDataUrl(element, options);

  const link = document.createElement("a");
  link.href = imageData;
  link.download = `${options.fileName || "export"}_${getTimestampSlug()}.png`;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
