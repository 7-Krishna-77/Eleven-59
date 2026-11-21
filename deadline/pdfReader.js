// Browser-based PDF text extraction using pdf.js CDN

export async function extractTextFromPdfFile(file) {
  if (!file) {
    throw new Error("No PDF file selected.");
  }

  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) {
    throw new Error("PDF.js library failed to load from CDN.");
  }

  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  const pageTexts = [];
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const strings = textContent.items.map((item) => item.str).filter(Boolean);
    pageTexts.push(`--- Page ${pageNum} ---\n${strings.join(" ")}`);
  }

  return pageTexts.join("\n\n").trim();
}