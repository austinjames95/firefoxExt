// webRequest handles http/https PDF URLs (fires before the request is made)
browser.webRequest.onBeforeRequest.addListener(
  listener,                             // function
  {urls: ['<all_urls>', 'file:///*']},  //  object
  ['blocking']                          //  optional array of strings
);

// webNavigation handles file:// PDF URLs — webRequest does not fire for file://
// onBeforeNavigate can't block/redirect directly, so we use tabs.update() instead
browser.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId !== 0) return;                              // top-level only
    if (!details.url.toLowerCase().includes('.pdf')) return;        // PDFs only
    if (details.url.startsWith(browser.runtime.getURL(''))) return; // skip own pages

    const viewerUrl = browser.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(details.url);
    browser.tabs.update(details.tabId, { url: viewerUrl });
  },
  { url: [{ schemes: ['file'] }] }  // only fire for file:// navigations
);

function listener(details) {
    console.log(details);
    if (details.url.startsWith(browser.runtime.getURL(''))){
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