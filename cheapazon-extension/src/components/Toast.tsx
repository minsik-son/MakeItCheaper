import React from 'react';

export interface ToastProps {
    match: {
        aliTitle: string;
        aliPrice: number;
        currency: string;
        savings: number;
        affiliateUrl: string;
        imageUrl: string;
    };
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ match, onClose }) => {
    const { savings, currency, aliPrice, affiliateUrl, imageUrl } = match;

    // Calculate discount percentage
    const originalPrice = savings + aliPrice;
    const discountPercent = originalPrice > 0 ? Math.round((savings / originalPrice) * 100) : 0;

    return (
        <div className="w-full max-w-sm animate-slide-in">
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden border border-white/20 ring-1 ring-black/5 font-sans">
                {/* Gradient Accent Bar */}
                <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 to-red-500"></div>

                <div className="p-4 relative">
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    <div className="flex gap-4">
                        {/* Product Image */}
                        <div className="shrink-0">
                            <img
                                src={imageUrl}
                                alt="Product"
                                className="w-20 h-20 object-cover rounded-lg border border-gray-100 shadow-sm"
                            />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="bg-gradient-to-r from-orange-500 to-red-600 text-transparent bg-clip-text text-xs font-black uppercase tracking-wider">
                                    Cheapazon Found
                                </span>
                            </div>

                            <div className="mb-2">
                                <p className="text-gray-500 text-xs line-through flex items-center gap-1">
                                    Amazon: <span className="text-gray-400">{currency} {(aliPrice + savings).toFixed(2)}</span>
                                </p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-bold text-gray-900 tracking-tight">
                                        {currency} {aliPrice.toFixed(2)}
                                    </span>
                                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                        -{discountPercent}%
                                    </span>
                                </div>
                            </div>

                            <a
                                href={affiliateUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full text-center bg-gray-900 hover:bg-black text-white text-sm font-bold py-2 px-4 rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                            >
                                View Deal & Save {currency} {savings.toFixed(2)}
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Toast;
