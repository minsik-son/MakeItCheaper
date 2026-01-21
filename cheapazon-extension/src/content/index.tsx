import React from 'react';
import { createRoot } from 'react-dom/client';
import { getCurrencyFromDomain } from '../utils/currency';
import { getProductDetails } from '../utils/scraper';
import Toast from '../components/Toast';
import '../style.css';

console.log('Cheapazon Content Script Loaded');

const init = async () => {
    const hostname = window.location.hostname;
    const currency = getCurrencyFromDomain(hostname);
    console.log(`Detected Currency: ${currency}`);

    const product = getProductDetails();
    if (!product) {
        console.log('No product details found or not a product page.');
        return;
    }

    console.log('Scraped Product:', product);

    // Call Backend via Background Script
    chrome.runtime.sendMessage({
        type: 'SEARCH_ALI',
        payload: {
            asin: product.asin,
            title: product.title,
            price: product.price,
            currency,
            domain: hostname.includes('ca') ? 'amazon.ca' : 'amazon.com'
        }
    }, (response) => {
        console.log('Background Response:', response);

        if (response && response.success && response.data) {
            const comparison = response.data;
            if (comparison.found && comparison.match) {
                console.log('Cheaper product found!', comparison.match);
                showToast(comparison.match);
            }
        } else {
            console.error('Background API call failed:', response?.error);
        }
    });
};

const showToast = (match: any) => {
    // Create container for Shadow DOM
    const container = document.createElement('div');
    container.id = 'cheapazon-root';
    container.style.position = 'fixed';
    container.style.zIndex = '99999';
    container.style.top = '16px';
    container.style.right = '16px';
    // container.style.pointerEvents = 'none'; // Optional: if we want clicks to pass through outside of toast

    document.body.appendChild(container);

    const shadowRoot = container.attachShadow({ mode: 'open' });

    // Inject styles
    const styleElement = document.createElement('style');
    shadowRoot.appendChild(styleElement);

    const cssUrl = chrome.runtime.getURL('content.css');
    fetch(cssUrl)
        .then(response => response.text())
        .then(css => {
            styleElement.textContent = css;
            console.log('Cheapazon CSS Injected');
        })
        .catch(err => {
            console.error('Failed to load Cheapazon CSS:', err);
        });

    // Create React Root
    const root = createRoot(shadowRoot);

    const handleClose = () => {
        root.unmount();
        container.remove();
    };

    root.render(
        <React.StrictMode>
            <Toast match={match} onClose={handleClose} />
        </React.StrictMode>
    );
};

// Run when page is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

