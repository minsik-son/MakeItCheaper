console.log('MakeItCheaper Background Script Running');

chrome.runtime.onInstalled.addListener(() => {
    console.log('MakeItCheaper Extension Installed');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SEARCH_ALI') {
        const { asin, title, price, imageUrl, currency, domain } = message.payload;
        const API_BASE_URL = 'http://localhost:3000'; // Localhost
        //const API_BASE_URL = 'https://make-it-cheaper.vercel.app'; // Main
        //const API_BASE_URL = 'https://make-it-cheaper-git-feature-minsik-sons-projects-d87de25c.vercel.app'; // Feature
        //const API_BASE_URL = 'https://make-it-cheaper-git-develop-minsik-sons-projects-d87de25c.vercel.app'; // Develop
        console.log('[Background] Searching AliExpress for:', title);

        fetch(`${API_BASE_URL}/api/compare`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ asin, title, price, imageUrl, currency, domain }),
        })
            .then(response => response.json())
            .then(data => {
                console.log('[Background] API Response:', data);
                sendResponse({ success: true, data });
            })
            .catch(error => {
                console.error('[Background] API Error:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep message channel open for async response
    }
});
