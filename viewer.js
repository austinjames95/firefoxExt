// pdfjsLib is exposed as a global by vendor/pdfjs/pdf.js (UMD build)
// getURL() converts "vendor/pdfjs/pdf.worker.js" → "moz-extension://uuid/vendor/pdfjs/pdf.worker.js"
// Without this, PDF.js can't spawn its worker and renders nothing
pdfjsLib.GlobalWorkerOptions.workerSrc = browser.runtime.getURL('/vendor/pdfjs/pdf.worker.js');


const params = new URLSearchParams(window.location.search);
const pdfUrl = params.get('file'); // the original PDF URL
const loadingTask = pdfjsLib.getDocument(pdfUrl);
const pdfDoc = await loadingTask.promise;


async function renderPage(pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });

  const wrapper = document.createElement('div');
  wrapper.className = 'page-wrapper';
  wrapper.dataset.pageNum = pageNum;
  wrapper.style.width  = viewport.width  + 'px';
  wrapper.style.height = viewport.height + 'px';
  wrapper.addEventListener('click', onPageClick);

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  wrapper.appendChild(canvas);
  document.getElementById('pdf-container').appendChild(wrapper);

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
}


let previewTimeout;
document.getElementById('latex-input').addEventListener('input', () => {
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(() => {
    const html = katex.renderToString(
      document.getElementById('latex-input').value,
      { throwOnError: false, displayMode: true }
    );
    document.getElementById('preview-area').innerHTML = html;
  }, 150);
});


// event.currentTarget = the .page-wrapper that was clicked
// getBoundingClientRect() gives its position on screen
// Subtract that from clientX/Y to get position within the wrapper
function onPageClick(event) {
  if (!placingMode) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const overlay = document.createElement('div');
  overlay.className = 'math-overlay';
  overlay.style.left = x + 'px';
  overlay.style.top  = y + 'px';
  overlay.innerHTML  = katex.renderToString(latexInput.value, { throwOnError: false, displayMode: true });

  // delete button
  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.textContent = '×';
  del.onclick = (e) => { e.stopPropagation(); overlay.remove(); };
  overlay.appendChild(del);

  event.currentTarget.appendChild(overlay);
  makeDraggable(overlay); // implement with mousedown/mousemove/mouseup
}
