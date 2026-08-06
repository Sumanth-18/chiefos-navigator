// Polyfill required by pdfjs-dist v5 on older Safari/iOS engines.
function ensurePromiseWithResolvers() {
  const P = Promise as unknown as { withResolvers?: unknown };
  if (typeof P.withResolvers !== "function") {
    P.withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }
}

async function extractPdf(file: File): Promise<string> {
  ensurePromiseWithResolvers();
  const pdfjsLib = await import("pdfjs-dist");

  try {
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // fall back to main-thread parsing below
  }

  // Keep a pristine copy: pdf.js transfers (detaches) the buffer it receives.
  const source = new Uint8Array(await file.arrayBuffer());

  const read = async (disableWorker: boolean) => {
    const pdf = await pdfjsLib.getDocument({
      data: source.slice(),
      disableWorker,
      isEvalSupported: false,
      useSystemFonts: false,
    } as never).promise;

    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = Array.isArray(content?.items) ? content.items : [];
      text += items.map((it) => (it && typeof it === "object" && "str" in it ? String((it as { str: unknown }).str) : "")).join(" ") + "\n";
    }
    return text.trim();
  };

  try {
    return await read(false);
  } catch {
    return await read(true);
  }
}

export async function extractTextFromFile(file: File): Promise<string> {
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
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value.trim();
  }

  if (name.endsWith(".doc")) {
    throw new Error("Legacy .doc is not supported — save as .docx or PDF.");
  }

  throw new Error("Unsupported file type. Upload a PDF, DOCX, TXT or MD file.");
}
