browser.webRequest.onBeforeRequest.addListener(
  listener,                             // function
  {urls: ['<all_urls>']},               //  object
  ['blocking']                          //  optional array of strings
);

function listener(details) {
    console.log(details);
    if (details.url.startsWith(browser.runtime.getURL(''))){
        return;
    }
    if (details.type !== 'main_frame') {
        return;
    }
    if (details.url.toLowerCase().includes('.pdf')) {
        return; // PDF Check
    }

    try { 
        new URL(details.url); 
    } catch(error) {
        console.log(error);
        return;
    }
    return {
        redirectUrl: browser.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(details.url)
    };  
}