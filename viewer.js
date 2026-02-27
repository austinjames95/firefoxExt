// viewer.js — runs as type="module" (see viewer.html), so top-level await is valid
// and this file has its own scope (variables here don't pollute window)

// ── Worker setup ─────────────────────────────────────────────────────────────
// pdfjsLib is set on window by vendor/pdfjs/pdf.js (loaded as a regular script before this module)
// browser.runtime.getURL() converts the relative extension path to moz-extension://uuid/...
pdfjsLib.GlobalWorkerOptions.workerSrc = browser.runtime.getURL('./vendor/pdfjs/pdf.worker.js');

// ── DOM references ────────────────────────────────────────────────────────────
const pdfContainer = document.getElementById('pdf-container');
const latexInput   = document.getElementById('latex-input');
const previewArea  = document.getElementById('preview-area');
const placeBtn     = document.getElementById('place-btn');
const statusMsg    = document.getElementById('status-msg');

// ── State ─────────────────────────────────────────────────────────────────────
let placingMode = false; // true when the user has clicked "place" and we await a PDF click

// ── Load PDF ──────────────────────────────────────────────────────────────────
// Read the PDF URL from the query string — background.js put it there as ?file=<encoded-url>
const params = new URLSearchParams(window.location.search);
const pdfUrl = params.get('file');

if (!pdfUrl) {
  pdfContainer.innerHTML = '<p style="color:red;padding:20px">No PDF URL provided.</p>';
} else {
  statusMsg.textContent = 'Loading PDF…';

  // pdfjsLib.getDocument() starts fetching + parsing the PDF.
  // .promise resolves to a PDFDocumentProxy when the document is ready.
  // top-level await is valid because viewer.html loads this as type="module"
  const pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;

  statusMsg.textContent = `Loaded — ${pdfDoc.numPages} page(s). Type LaTeX then click "Place".`;

  // Render every page sequentially (awaiting each before starting the next
  // keeps memory use lower than rendering all pages in parallel)
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    await renderPage(pdfDoc, pageNum);
  }
}

// ── Page rendering ────────────────────────────────────────────────────────────
async function renderPage(pdfDoc, pageNum) {
  const page     = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });

  // .page-wrapper is position:relative — it is the coordinate anchor for
  // any .math-overlay children that use position:absolute.
  // Without position:relative here, overlays would be positioned relative
  // to the nearest positioned ancestor up the tree (probably the body),
  // and all click coordinates would be wrong.
  const wrapper = document.createElement('div');
  wrapper.className    = 'page-wrapper';
  wrapper.dataset.pageNum = pageNum;
  wrapper.style.width  = viewport.width  + 'px';
  wrapper.style.height = viewport.height + 'px';

  const canvas = document.createElement('canvas');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  wrapper.appendChild(canvas);
  pdfContainer.appendChild(wrapper);

  // Register the click handler for overlay placement on this page
  wrapper.addEventListener('click', onPageClick);

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
}

// ── KaTeX live preview ────────────────────────────────────────────────────────
let previewTimeout;
latexInput.addEventListener('input', () => {
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(() => {
    const latex = latexInput.value.trim();
    if (!latex) { previewArea.innerHTML = ''; return; }
    previewArea.innerHTML = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: true,
    });
  }, 150); // 150 ms debounce so we don't re-render on every keystroke
});

// ── Place-button: toggle placing mode ─────────────────────────────────────────
placeBtn.addEventListener('click', () => {
  if (!latexInput.value.trim()) {
    statusMsg.textContent = 'Enter some LaTeX first.';
    return;
  }
  placingMode = !placingMode;

  if (placingMode) {
    placeBtn.textContent = 'Cancel';
    placeBtn.classList.add('active');
    statusMsg.textContent = 'Click anywhere on a PDF page to place the equation.';
    document.querySelectorAll('.page-wrapper').forEach(w => w.style.cursor = 'crosshair');
  } else {
    cancelPlacement();
  }
});

function cancelPlacement() {
  placingMode = false;
  placeBtn.textContent = 'Click on PDF to place';
  placeBtn.classList.remove('active');
  statusMsg.textContent = '';
  document.querySelectorAll('.page-wrapper').forEach(w => w.style.cursor = '');
}

// ── Click → coordinate → overlay ─────────────────────────────────────────────
function onPageClick(event) {
  if (!placingMode) return;

  // getBoundingClientRect() returns the wrapper's position on screen (in viewport pixels).
  // Subtracting from clientX/Y gives us the click position WITHIN the wrapper —
  // which is exactly what we need for position:absolute inside position:relative.
  const rect = event.currentTarget.getBoundingClientRect();
  const x    = event.clientX - rect.left;
  const y    = event.clientY - rect.top;

  // Build the overlay element
  const overlay       = document.createElement('div');
  overlay.className   = 'math-overlay';
  overlay.style.left  = x + 'px';
  overlay.style.top   = y + 'px';
  overlay.innerHTML   = katex.renderToString(latexInput.value.trim(), {
    throwOnError: false,
    displayMode: true,
  });

  // Delete button (shown on hover via CSS)
  const del         = document.createElement('button');
  del.className     = 'delete-btn';
  del.textContent   = '×';
  del.title         = 'Remove';
  del.addEventListener('click', (e) => {
    e.stopPropagation(); // don't re-trigger the page click listener
    overlay.remove();
  });
  overlay.appendChild(del);

  event.currentTarget.appendChild(overlay);
  makeDraggable(overlay);
  cancelPlacement();
}

// ── Drag to reposition ────────────────────────────────────────────────────────
function makeDraggable(el) {
  let dragging = false;
  let startX, startY, origLeft, origTop;

  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('delete-btn')) return; // don't drag via delete btn
    dragging  = true;
    startX    = e.clientX;
    startY    = e.clientY;
    origLeft  = parseInt(el.style.left, 10) || 0;
    origTop   = parseInt(el.style.top,  10) || 0;
    e.preventDefault(); // prevent text selection while dragging
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  function onMove(e) {
    if (!dragging) return;
    el.style.left = (origLeft + e.clientX - startX) + 'px';
    el.style.top  = (origTop  + e.clientY - startY) + 'px';
  }

  function onUp() {
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
  }
}
