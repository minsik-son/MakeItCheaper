export type Currency = 'USD' | 'CAD';

export const getCurrencyFromDomain = (hostname: string): Currency => {
    if (hostname.includes('amazon.ca')) {
        return 'CAD';
    }
    return 'USD';
};

export const formatCurrency = (amount: number, currency: Currency): string => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
    }).format(amount);
};
