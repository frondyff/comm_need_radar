import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { getFlyerFileName } from "./flyerData";
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

  async export(service) {
    const flyerElement = this.#getFlyerElement();
    const canvas = await this.#canvasRenderer(flyerElement, {
      backgroundColor: "#ffffff",
      logging: false,
      scale: 2,
      useCORS: true,
    });
    const pdf = this.#createPdf();
    const placement = this.#getImagePlacement(pdf, canvas);
    const fileName = getFlyerFileName(service);

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
    const margin = 8;
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
