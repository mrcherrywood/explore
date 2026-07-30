"use client";

export type RenderPngOptions = {
  scale?: number;
  bgcolor?: string;
  /** Minimum capture width in px; pass the element width for exact-size captures. */
  minWidth?: number;
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

  const captureWidth = Math.max(element.offsetWidth, options.minWidth ?? 960);
  clonedElement.style.width = `${captureWidth}px`;
  clonedElement.style.minWidth = `${captureWidth}px`;
  clonedElement.style.boxSizing = "border-box";
  clonedElement.style.position = "absolute";
  clonedElement.style.left = "-9999px";
  // Mount the clone beside the original so it inherits the same CSS cascade
  // (theme variables, fonts, light/dark context) instead of the body's theme.
  (element.parentElement ?? document.body).appendChild(clonedElement);

  try {
    const bgcolor = options.bgcolor ?? resolveEffectiveBackgroundColor(element);

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
    clonedElement.remove();
  }
}

/**
 * Walk up from the element to the first non-transparent background color so
 * the export matches the theme the element is actually rendered on (e.g. the
 * light plan preview theme rather than the app's dark body background).
 */
function resolveEffectiveBackgroundColor(element: HTMLElement): string {
  let node: HTMLElement | null = element;
  while (node) {
    const background = getComputedStyle(node).backgroundColor;
    if (background && background !== "transparent" && background !== "rgba(0, 0, 0, 0)") {
      return background;
    }
    node = node.parentElement;
  }
  return "#ffffff";
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
