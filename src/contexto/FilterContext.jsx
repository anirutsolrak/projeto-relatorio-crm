import React, { createContext, useState, useMemo, useCallback } from 'react';

const defaultEndDate = new Date().toISOString().split('T')[0];
const defaultStartDate = new Date(new Date().setDate(new Date().getDate() - 6)).toISOString().split('T')[0];

const initialPeriodState = {
    startDate: defaultStartDate,
    endDate: defaultEndDate,
};

// Estrutura inicial do contexto, incluindo o cache
export const FilterContext = createContext({
    period: initialPeriodState,
    setPeriod: () => console.warn('setPeriod called outside of FilterProvider'),
    cachedData: {}, // Objeto para armazenar dados cacheados
    updateCache: () => console.warn('updateCache called outside of FilterProvider'),
    clearCache: () => console.warn('clearCache called outside of FilterProvider'),
});

export function FilterProvider({ children }) {
    const [period, setPeriodState] = useState(initialPeriodState);
    const [cachedData, setCachedData] = useState({}); // Estado para o cache

    // Função para atualizar o período, limpando o cache relevante
    const setPeriod = useCallback((newPeriod) => {
        if (newPeriod && newPeriod.startDate && newPeriod.endDate) {
            const oldPeriodKey = `${period.startDate}_${period.endDate}`;
            const newPeriodKey = `${newPeriod.startDate}_${newPeriod.endDate}`;

            setPeriodState({
                startDate: newPeriod.startDate,
                endDate: newPeriod.endDate,
            });

            // Se o período realmente mudou, limpa o cache (poderia ser mais granular)
            // Por enquanto, limpar tudo ao mudar o período é mais simples.
            if (oldPeriodKey !== newPeriodKey) {
                console.log('[FilterContext] Period changed, clearing cache.');
                setCachedData({});
            }
            console.log('[FilterContext] Period updated:', newPeriod);
        } else {
            console.warn('[FilterContext] Attempted to set invalid period:', newPeriod);
        }
    }, [period.startDate, period.endDate]); // Include dependencies

    // Função para atualizar/adicionar dados ao cache
    const updateCache = useCallback((viewName, periodKey, data) => {
        setCachedData(prevCache => {
            const newCache = { ...prevCache };
            if (!newCache[viewName]) {
                newCache[viewName] = {};
            }
            newCache[viewName][periodKey] = { data, timestamp: Date.now() };
            console.log(`[FilterContext] Cache updated for ${viewName} - ${periodKey}`);
            return newCache;
        });
    }, []);

    // Função para limpar todo o cache (poderia ser usada para um botão "Atualizar")
    const clearCache = useCallback(() => {
        console.log('[FilterContext] Clearing all cached data.');
        setCachedData({});
    }, []);

    // Memoiza o valor do contexto para evitar re-renderizações desnecessárias
    const contextValue = useMemo(() => ({
        period,
        setPeriod,
        cachedData,
        updateCache,
        clearCache,
    }), [period, setPeriod, cachedData, updateCache, clearCache]);

    return (
        <FilterContext.Provider value={contextValue}>
            {children}
        </FilterContext.Provider>
    );
}