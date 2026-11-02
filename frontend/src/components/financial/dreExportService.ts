export type DreExportFormat = "pdf" | "jpg";

export interface JpegPageImage {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

export function sanitizeCompanySlug(companyName: string): string {
  const normalized = (companyName || "empresa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "empresa";
}

export function buildDreExportFilename(
  companyName: string,
  period: { from: string; to: string },
  format: DreExportFormat,
): string {
  const slug = sanitizeCompanySlug(companyName);
  const safeFrom = (period.from || "").trim().replace(/[^0-9-]/g, "");
  const safeTo = (period.to || "").trim().replace(/[^0-9-]/g, "");
  return `dre-${slug}-${safeFrom}-a-${safeTo}.${format}`;
}

export function formatExportGeneratedAt(dateInput: Date | string = new Date()): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) {
    return String(dateInput);
  }
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export async function renderElementToJpegDataUrl(
  element: HTMLElement,
  options?: {
    scale?: number;
    quality?: number;
    logicalWidth?: number;
    logicalHeight?: number;
  },
): Promise<JpegPageImage> {
  const scale = options?.scale ?? 2;
  const quality = options?.quality ?? 0.92;

  const rect = element.getBoundingClientRect();
  const logicalWidth = Math.max(
    1,
    Math.round(
      options?.logicalWidth ||
        element.scrollWidth ||
        element.offsetWidth ||
        rect.width ||
        840,
    ),
  );
  const logicalHeight = Math.max(
    1,
    Math.round(
      options?.logicalHeight ||
        element.scrollHeight ||
        element.offsetHeight ||
        rect.height ||
        1188,
    ),
  );

  const widthPx = Math.round(logicalWidth * scale);
  const heightPx = Math.round(logicalHeight * scale);

  const clone = element.cloneNode(true) as HTMLElement;
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.style.margin = "0";
  clone.style.width = `${logicalWidth}px`;
  clone.style.height = `${logicalHeight}px`;
  clone.style.boxSizing = "border-box";

  const serialized = new XMLSerializer().serializeToString(clone);
  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${logicalWidth} ${logicalHeight}"><foreignObject x="0" y="0" width="${logicalWidth}" height="${logicalHeight}">${serialized}</foreignObject></svg>`;
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "sync";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Não foi possível renderizar o relatório para imagem."));
    image.src = svgDataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Contexto gráfico 2D indisponível no navegador.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.drawImage(img, 0, 0, widthPx, heightPx);

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return {
    dataUrl,
    widthPx,
    heightPx,
  };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function extractJpegBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(",");
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return base64ToUint8Array(base64);
}

/**
 * Generates a standard A4 Portrait (595.28 x 841.89 pt) PDF 1.4 binary
 * embedding one high-resolution JPEG image per page via native /DCTDecode.
 */
export function buildPdfFromJpegPages(pages: JpegPageImage[]): Uint8Array {
  if (pages.length === 0) {
    throw new Error("Nenhuma página disponível para gerar o PDF.");
  }

  const A4_WIDTH_PT = 595.28;
  const A4_HEIGHT_PT = 841.89;
  const encoder = new TextEncoder();

  const chunks: Uint8Array[] = [];
  let currentOffset = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const pushAscii = (text: string) => {
    pushBytes(encoder.encode(text));
  };

  // PDF 1.4 Header + binary comment marker
  pushBytes(
    new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xff, 0xff,
      0xff, 0xff, 0x0a,
    ]),
  );

  const totalObjects = 2 + pages.length * 3;
  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  // Object 1: Catalog
  offsets[1] = currentOffset;
  pushAscii("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // Object 2: Pages Root
  const kidRefs = pages.map((_, idx) => `${3 + idx * 3} 0 R`).join(" ");
  offsets[2] = currentOffset;
  pushAscii(
    `2 0 obj\n<< /Type /Pages /Kids [ ${kidRefs} ] /Count ${pages.length} >>\nendobj\n`,
  );

  // Objects for each page
  pages.forEach((page, idx) => {
    const pageObjId = 3 + idx * 3;
    const contentObjId = 4 + idx * 3;
    const imageObjId = 5 + idx * 3;

    const jpegBytes = extractJpegBytes(page.dataUrl);
    const aspect = page.heightPx / Math.max(1, page.widthPx);
    let drawW = A4_WIDTH_PT;
    let drawH = A4_WIDTH_PT * aspect;
    if (drawH > A4_HEIGHT_PT) {
      drawH = A4_HEIGHT_PT;
      drawW = A4_HEIGHT_PT / aspect;
    }
    const drawX = (A4_WIDTH_PT - drawW) / 2;
    const drawY = A4_HEIGHT_PT - drawH;

    // Page Object
    offsets[pageObjId] = currentOffset;
    pushAscii(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${A4_WIDTH_PT.toFixed(
        2,
      )} ${A4_HEIGHT_PT.toFixed(
        2,
      )} ] /Resources << /XObject << /Im0 ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`,
    );

    // Content Stream Object
    const contentStream = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(
      2,
    )} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    offsets[contentObjId] = currentOffset;
    pushAscii(
      `${contentObjId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`,
    );
    pushBytes(contentBytes);
    pushAscii("\nendstream\nendobj\n");

    // Image XObject
    offsets[imageObjId] = currentOffset;
    pushAscii(
      `${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    );
    pushBytes(jpegBytes);
    pushAscii("\nendstream\nendobj\n");
  });

  // Cross-reference table
  const xrefOffset = currentOffset;
  pushAscii(`xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= totalObjects; id++) {
    const padded = String(offsets[id]).padStart(10, "0");
    pushAscii(`${padded} 00000 n \n`);
  }

  // Trailer
  pushAscii(
    `trailer\n<< /Size ${
      totalObjects + 1
    } /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  // Concatenate all chunks
  const pdfBytes = new Uint8Array(currentOffset);
  let cursor = 0;
  for (const chunk of chunks) {
    pdfBytes.set(chunk, cursor);
    cursor += chunk.length;
  }

  return pdfBytes;
}

export function dataUrlToBlob(dataUrl: string, mimeType = "image/jpeg"): Blob {
  const bytes = extractJpegBytes(dataUrl);
  return new Blob([bytes as unknown as BlobPart], { type: mimeType });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

export async function exportDreReportToJpg(
  reportElement: HTMLElement,
  filename: string,
): Promise<{ image: JpegPageImage; filename: string }> {
  const continuousSheet =
    (reportElement.querySelector(
      '[data-export-continuous="true"]',
    ) as HTMLElement | null) ?? reportElement;

  const image = await renderElementToJpegDataUrl(continuousSheet, {
    scale: 2,
    quality: 0.92,
    logicalWidth: 840,
  });

  const blob = dataUrlToBlob(image.dataUrl, "image/jpeg");
  triggerBlobDownload(blob, filename);

  return { image, filename };
}

export async function exportDreReportToPdf(
  reportElement: HTMLElement,
  filename: string,
): Promise<{ pdfBytes: Uint8Array; pageCount: number; filename: string }> {
  const pageNodes = Array.from(
    reportElement.querySelectorAll<HTMLElement>("[data-export-page]"),
  );

  const targets = pageNodes.length > 0 ? pageNodes : [reportElement];
  const renderedPages: JpegPageImage[] = [];

  for (const pageNode of targets) {
    const img = await renderElementToJpegDataUrl(pageNode, {
      scale: 2,
      quality: 0.92,
      logicalWidth: 840,
      logicalHeight: 1188,
    });
    renderedPages.push(img);
  }

  const pdfBytes = buildPdfFromJpegPages(renderedPages);
  const blob = new Blob([pdfBytes as unknown as BlobPart], {
    type: "application/pdf",
  });
  triggerBlobDownload(blob, filename);

  return {
    pdfBytes,
    pageCount: renderedPages.length,
    filename,
  };
}
