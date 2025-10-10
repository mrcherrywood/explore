"use client";

import type { jsPDFOptions } from "jspdf";

export type ExportPdfOptions = {
  fileName?: string;
  orientation?: jsPDFOptions["orientation"];
  format?: jsPDFOptions["format"];
  margin?: number;
  scale?: number;
};

const DEFAULT_FILE_PREFIX = "export";

function getTimestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function dataUrlToUint8Array(dataUrl: string) {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Failed to convert data URL to binary data for PDF export");
  }

  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function exportElementToPdf(
  element: HTMLElement,
  options: ExportPdfOptions = {}
) {
  const { orientation = "portrait", format = "letter", margin = 36, scale = 2 } = options;

  // Use dom-to-image-more which handles modern CSS better (including lab() colors)
  // @ts-expect-error - no types available for this package
  const domtoimage = await import("dom-to-image-more");
  const { jsPDF } = await import("jspdf");

  if (!element) {
    throw new Error("PDF export target element is not available");
  }

  // Clone and prepare the element for export
  const clonedElement = element.cloneNode(true) as HTMLElement;
  
  // Remove problematic SVG elements that cause data URI fetch errors
  const svgElements = clonedElement.querySelectorAll('svg[style*="data:image"]');
  svgElements.forEach(svg => svg.remove());
  
  // Remove inline style attributes with data URIs
  const allElements = clonedElement.querySelectorAll('*');
  allElements.forEach(el => {
    if (el instanceof HTMLElement) {
      const style = el.getAttribute('style');
      if (style && style.includes('data:image')) {
        // Remove the problematic background-image style
        el.style.backgroundImage = 'none';
      }
    }
  });

  // Temporarily append to body for rendering (hidden)
  clonedElement.style.position = 'absolute';
  clonedElement.style.left = '-9999px';
  document.body.appendChild(clonedElement);

  try {
    // Generate PNG data URL using dom-to-image-more
    const imageData = await domtoimage.toPng(clonedElement, {
      bgcolor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      quality: 1,
      width: element.scrollWidth * scale,
      height: element.scrollHeight * scale,
      style: {
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        width: `${element.scrollWidth}px`,
        height: `${element.scrollHeight}px`,
        position: 'static',
        left: 'auto',
      },
      cacheBust: false,
      filter: (node: Node) => {
        if (node instanceof HTMLElement) {
          const tagName = node.tagName?.toLowerCase();
          if (tagName === 'script' || tagName === 'style') {
            return false;
          }
        }
        return true;
      },
    });

    // Clean up cloned element
    document.body.removeChild(clonedElement);
    
    // Convert PNG data URL to binary to avoid signature issues in jsPDF
    if (!imageData.startsWith("data:image/png")) {
      throw new Error("PDF export expected a PNG data URL");
    }
    const imageBinary = await dataUrlToUint8Array(imageData);

    // Generate PDF from the image data
    const pdf = new jsPDF({ orientation, unit: "pt", format });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    // Calculate dimensions based on the element's actual size
    const imgWidth = element.scrollWidth * scale;
    const imgHeight = element.scrollHeight * scale;
    
    const ratio = Math.min(usableWidth / imgWidth, 1);
    const finalWidth = imgWidth * ratio;
    const finalHeight = imgHeight * ratio;

    let heightLeft = finalHeight;

    pdf.addImage(
      imageBinary,
      "PNG",
      margin,
      margin,
      finalWidth,
      finalHeight,
      undefined,
      "FAST"
    );
    heightLeft -= usableHeight;

    while (heightLeft > 0) {
      const position = margin - (finalHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(
        imageBinary,
        "PNG",
        margin,
        position,
        finalWidth,
        finalHeight,
        undefined,
        "FAST"
      );
      heightLeft -= usableHeight;
    }

    const fileName = `${options.fileName || DEFAULT_FILE_PREFIX}_${getTimestampSlug()}.pdf`;
    pdf.save(fileName);
  } catch (error) {
    // Clean up on error
    if (document.body.contains(clonedElement)) {
      document.body.removeChild(clonedElement);
    }
    throw error;
  }
}

