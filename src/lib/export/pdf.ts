"use client";

import type { jsPDFOptions } from "jspdf";
import { renderElementToPngDataUrl } from "@/lib/export/dom-image";

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

  if (!element) {
    throw new Error("PDF export target element is not available");
  }

  const { jsPDF } = await import("jspdf");

  // Generate PNG data URL using the shared dom-to-image renderer
  const imageData = await renderElementToPngDataUrl(element, { scale });

  // Convert PNG data URL to binary to avoid signature issues in jsPDF
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

  pdf.addImage(imageBinary, "PNG", margin, margin, finalWidth, finalHeight, undefined, "FAST");
  heightLeft -= usableHeight;

  while (heightLeft > 0) {
    const position = margin - (finalHeight - heightLeft);
    pdf.addPage();
    pdf.addImage(imageBinary, "PNG", margin, position, finalWidth, finalHeight, undefined, "FAST");
    heightLeft -= usableHeight;
  }

  const fileName = `${options.fileName || DEFAULT_FILE_PREFIX}_${getTimestampSlug()}.pdf`;
  pdf.save(fileName);
}

export type ExportPagesPdfOptions = {
  fileName?: string;
  scale?: number;
};

/**
 * Exports a set of pre-sized report page elements as a multi-page PDF, one
 * element per letter-portrait page. Each element should already be laid out
 * at the 8.5x11 aspect ratio; the rendered image fills the entire page.
 */
export async function exportPagesToPdf(
  pages: HTMLElement[],
  options: ExportPagesPdfOptions = {}
) {
  const { scale = 2 } = options;
  if (pages.length === 0) {
    throw new Error("PDF export requires at least one report page element");
  }

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let index = 0; index < pages.length; index += 1) {
    const element = pages[index];
    const imageData = await renderElementToPngDataUrl(element, {
      scale,
      minWidth: element.offsetWidth,
    });
    const imageBinary = await dataUrlToUint8Array(imageData);
    if (index > 0) pdf.addPage();
    pdf.addImage(imageBinary, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
  }

  const fileName = `${options.fileName || DEFAULT_FILE_PREFIX}_${getTimestampSlug()}.pdf`;
  pdf.save(fileName);
}

