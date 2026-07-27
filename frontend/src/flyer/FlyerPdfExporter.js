import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { FLYER_PREVIEW_ELEMENT_ID } from "./flyerStyles";

export class FlyerPdfExporter {
  #previewElementId;
  #canvasRenderer;
  #createPdf;

  constructor({
    previewElementId = FLYER_PREVIEW_ELEMENT_ID,
    canvasRenderer = html2canvas,
    createPdf = () => new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" }),
  } = {}) {
    this.#previewElementId = previewElementId;
    this.#canvasRenderer = canvasRenderer;
    this.#createPdf = createPdf;
  }

  async export(flyer) {
    if (!flyer?.service || !flyer?.fileName) {
      throw new Error("A current flyer view model is required for export.");
    }

    const flyerElement = this.#getFlyerElement();
    const canvas = await this.#canvasRenderer(flyerElement, {
      backgroundColor: "#ffffff",
      logging: false,
      // html2canvas receives a clone, so remove only the preview controls
      // there. The live Leaflet map keeps its user-selected zoom and the
      // in-map legend remains part of the downloaded flyer.
      onclone: (clonedDocument) => {
        clonedDocument.querySelectorAll(".flyer-map-controls").forEach((control) => control.remove());
      },
      scale: 2,
      useCORS: true,
    });
    const pdf = this.#createPdf();
    const placement = this.#getImagePlacement(pdf, canvas);
    const fileName = flyer.fileName;

    pdf.addImage(canvas.toDataURL("image/png"), "PNG", placement.x, placement.y, placement.width, placement.height);
    pdf.save(fileName);

    return fileName;
  }

  #getFlyerElement() {
    const flyerElement = document.getElementById(this.#previewElementId);

    if (!flyerElement) {
      throw new Error("Flyer preview is not available for export.");
    }

    return flyerElement;
  }

  #getImagePlacement(pdf, canvas) {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    // The flyer preview is already an A4-proportioned composition. Keep the
    // export edge-to-edge so the downloaded page is the same composition,
    // rather than shrinking it into an additional white frame.
    const margin = 0;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const imageRatio = canvas.width / canvas.height;
    let width = maxWidth;
    let height = width / imageRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * imageRatio;
    }

    return {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    };
  }
}

export const flyerPdfExporter = new FlyerPdfExporter();
