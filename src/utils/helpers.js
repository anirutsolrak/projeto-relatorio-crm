export const reportError = (error, context = 'Unknown') => {
        console.error(`[${context} Error]:`, error?.message || error);
    };

