async function extractPdf(file: File): Promise<string> {
  // The legacy bundle includes the Promise/AbortSignal/iterator polyfills that
  // pdf.js v5's modern build assumes. That matters on older Safari/WebViews.
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  try {
    const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // getDocument can still use its in-process fallback when a worker URL is
    // unavailable, so extraction remains usable in constrained webviews.
  }

  // pdf.js may transfer the Uint8Array to its worker. Give it a fresh owned
  // copy exactly once; retrying the same loading task can encounter a detached
  // buffer and obscures the original error.
  const source = new Uint8Array(await file.arrayBuffer()).slice();
  const loadingTask = pdfjsLib.getDocument({
    data: source,
    isEvalSupported: false,
    useSystemFonts: false,
  } as Parameters<typeof pdfjsLib.getDocument>[0]);

  try {
    const pdf = await loadingTask.promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = Array.isArray(content?.items) ? content.items : [];
      text += items.map((it) => (it && typeof it === "object" && "str" in it ? String((it as { str: unknown }).str) : "")).join(" ") + "\n";
    }
    return text.trim();
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

export async function extractTextFromFile(file: File): Promise<string> {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("The selected file is empty or unavailable. Please choose it again.");
  }

  const name = file.name.toLowerCase();

  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return (await file.text()).trim();
  }

  if (name.endsWith(".pdf")) {
    const text = await extractPdf(file);
    if (!text) throw new Error("This PDF has no selectable text (it may be a scan). Paste the requirements instead.");
    return text;
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ arrayBuffer: bytes.slice().buffer });
    return result.value.trim();
  }

  if (name.endsWith(".doc")) {
    throw new Error("Legacy .doc is not supported — save as .docx or PDF.");
  }

  throw new Error("Unsupported file type. Upload a PDF, DOCX, TXT or MD file.");
}
