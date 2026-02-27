// webRequest handles http/https PDF URLs (fires before the request is made)
browser.webRequest.onBeforeRequest.addListener(
  listener,                             // function
  {urls: ['<all_urls>', 'file:///*']},  //  object
  ['blocking']                          //  optional array of strings
);

// webNavigation handles file:// PDF URLs — webRequest does not fire for file://
// onBeforeNavigate can't block/redirect directly, so we use tabs.update() instead
// When the page is a local file, the moz-extension origin cannot fetch it directly,
// so we pre‑fetch the data here in the background page and hand the viewer a blob
// URL.  pdf.js can then load the blob without triggering the "status 0" error.

async function fetchToBlobUrl(url) {
  console.log('fetchToBlobUrl', url);
  // extension has <all_urls> permission.  Any failure will propagate.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}

browser.webNavigation.onBeforeNavigate.addListener(
  async (details) => {
    if (details.frameId !== 0) return;                              // top-level only
    if (!details.url.toLowerCase().includes('.pdf')) return;        // PDFs only
    if (details.url.startsWith(browser.runtime.getURL(''))) return; // skip own pages

    let fileParam;
    if (details.url.startsWith('file://')) {
      try {
        fileParam = await fetchToBlobUrl(details.url);
      } catch (err) {
        console.error('Unable to load local PDF', err);
        // fall back to the raw file URL; viewer.js will still complain but this
        // gives the user feedback rather than silently doing nothing.
        fileParam = details.url;
      }
    } else {
      fileParam = details.url;
    }

    const viewerUrl = browser.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(fileParam);
    browser.tabs.update(details.tabId, { url: viewerUrl });
  },
  { url: [{ schemes: ['file'] }] }  // only fire for file:// navigations
);

function listener(details) {
    // ignore any requests that originated from our own extension pages
    if (details.url.startsWith(browser.runtime.getURL(''))){
        return;
    }
    // let file:// URLs bypass webRequest; they're handled by webNavigation instead
    if (details.url.startsWith('file://')) {
        return;
    }

    if (details.type !== 'main_frame') {
        return;
    }
    if (!details.url.toLowerCase().includes('.pdf')) {
        return; // Not a PDF, skip
    }

    try { 
        new URL(details.url); 
    } catch(error) {
        console.log("ERROR: ", error);
        return;
    }
    return {
        redirectUrl: browser.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(details.url)
    };  
}