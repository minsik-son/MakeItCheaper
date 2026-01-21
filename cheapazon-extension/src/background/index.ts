console.log('Cheapazon Background Script Running');

chrome.runtime.onInstalled.addListener(() => {
    console.log('Cheapazon Extension Installed');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SEARCH_ALI') {
        const { asin, title, price, currency, domain } = message.payload;
        const API_BASE_URL = 'http://localhost:3000'; // Hardcoded for dev, or inject via build

        console.log('[Background] Searching AliExpress for:', title);

        fetch(`${API_BASE_URL}/api/compare`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ asin, title, price, currency, domain }),
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
