import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from 'react';
import { Chart } from 'chart.js/auto';
import AnnotationPlugin from 'chartjs-plugin-annotation';
import LoadingOverlay from '../components/LoadingOverlay';
import PeriodFilter from '../components/PeriodFilter';
import FileUploaderEstoque from '../components/FileUploaderEstoque';
import EstoqueService from '../utils/EstoqueService';
import KPIPanel from '../components/KPIPanel';
import ChartComponent from '../components/ChartComponent';
import TruncatedTextWithPopover from '../components/TruncatedTextWithPopover';
import { FilterContext } from '../contexto/FilterContext';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';

Chart.register(AnnotationPlugin);

const reportError = (error, context = 'Unknown') => {
    console.error(`[${context}] Error:`, error?.message || error);
};

function ChartMobileSummary({ title, data = [], onExpandClick, expandButtonText }) {
    const formatValue = (val, isPercent = false) => {
        if (val === null || val === undefined || isNaN(Number(val))) return '-';
        const num = Number(val);
        const options = isPercent ? { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 } : { minimumFractionDigits: 0, maximumFractionDigits: 0 };
        return num.toLocaleString('pt-BR', options);
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow-md h-full flex flex-col justify-between min-h-[200px]">
            <div>
                <h3 className="text-base font-semibold text-gray-700 mb-4">{title}</h3>
                <div className="space-y-1 text-sm max-h-48 overflow-y-auto pr-2">
                    {data.map((item, index) => (
                        <div key={`${index}-${item.label}`} className="flex justify-between">
                            <TruncatedTextWithPopover className="text-gray-500 mr-2" title={item.label}>{item.label}:</TruncatedTextWithPopover>
                            <span className="font-medium flex-shrink-0">{formatValue(item.value, item.isPercent)}</span>
                        </div>
                    ))}
                    {data.length === 0 && <p className='text-gray-400 text-xs italic'>Nenhum dado para resumir.</p>}
                </div>
            </div>
            {onExpandClick && (<div className="mt-4 text-right"><button onClick={onExpandClick} className="btn btn-secondary btn-xs py-1 px-2">{expandButtonText || "Ver Gráfico"}</button></div>)}
        </div>
    );
}

function Estoque({ user, onNavigate }) {
    const { period, cachedData, updateCache } = useContext(FilterContext);
    const estoqueService = useMemo(() => EstoqueService(), []);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const initialProductData = useMemo(() => ({ PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null }), []);
    const [latestStockMetricsByProduct, setLatestStockMetricsByProduct] = useState({ click: { ...initialProductData }, mt: { ...initialProductData }, capital: { ...initialProductData } });
    const [stockTimeSeriesByProduct, setStockTimeSeriesByProduct] = useState({ click: [], mt: [], capital: [] });
    const [showUploader, setShowUploader] = useState(false);
    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
    const [isChartExpanded, setIsChartExpanded] = useState(false);
    const stockChartScrollContainerRef = useRef(null);
    const [lowStockAlertItems, setLowStockAlertItems] = useState({});
    const [activeProductTab, setActiveProductTab] = useState(0);
    const productKeys = useMemo(() => ['click', 'mt', 'capital'], []);
    const STOCK_THRESHOLD = 50;

    const fetchAllStockData = useCallback(async (startDate, endDate) => {
        const periodKey = `${startDate}_${endDate}`;
        const viewCache = cachedData?.estoque?.[periodKey];
        if (viewCache) {

            const cached = viewCache.data;
            setLatestStockMetricsByProduct(cached.latestStockMetricsByProduct);
            setStockTimeSeriesByProduct(cached.stockTimeSeriesByProduct);
            setLowStockAlertItems(cached.lowStockAlertItems || {});
            setIsLoading(false); setError(null); return;
        }


        if (!estoqueService) { setIsLoading(false); setError("Erro interno: Serviço não inicializado."); return; }
        setIsLoading(true); setError(null);
        const resetLatest = { click: { ...initialProductData }, mt: { ...initialProductData }, capital: { ...initialProductData } };
        const resetTimeSeries = { click: [], mt: [], capital: [] };
        setLatestStockMetricsByProduct(resetLatest); setStockTimeSeriesByProduct(resetTimeSeries); setLowStockAlertItems({});

        try {

            const [latestResult, timeSeriesResult] = await Promise.all([
                estoqueService.getLatestStockMetrics(startDate, endDate),
                estoqueService.getStockTimeSeries(startDate, endDate)
            ]);


            const errors = [];
            if (latestResult.error) errors.push(`KPIs Último Dia (Agregado): ${latestResult.error.message || 'Erro desconhecido'}`);
            if (timeSeriesResult.error) errors.push(`Série Temporal: ${timeSeriesResult.error.message || 'Erro desconhecido'}`);
            if (errors.length > 0) { throw new Error(errors.join('; ')); }

            // 1. Process time series data into a more usable format, ensure values are numbers
            const fetchedTimeSeriesDataByProduct = { click: [], mt: [], capital: [] };
             if (timeSeriesResult.data && Array.isArray(timeSeriesResult.data)) {
                 timeSeriesResult.data.forEach(item => {
                     if (item.product_code && fetchedTimeSeriesDataByProduct[item.product_code]) {
                         const numericValue = parseFloat(item.value);
                         fetchedTimeSeriesDataByProduct[item.product_code].push({
                             ...item,
                             value: isNaN(numericValue) ? null : numericValue, // Store as number or null
                             item_type_normalized: item.item_type?.toUpperCase().replace('Ã', 'A').replace('Á', 'A') // Pre-normalize for matching
                         });
                     }
                 });
             }
             // Set the state used by the chart
             setStockTimeSeriesByProduct(fetchedTimeSeriesDataByProduct);

             // 2. Prepare the state for KPIs and process data per product
             const latestAggregatedData = latestResult.data || {}; // Data for Est. Ant, Embossing etc.
             const fetchedLatestDataByProduct = { click: { ...initialProductData }, mt: { ...initialProductData }, capital: { ...initialProductData } };

             for (const productCode of productKeys) {
                 const productTimeSeries = fetchedTimeSeriesDataByProduct[productCode] || [];
                 let productLatestDate = null;
                 let latestEntriesForProduct = [];

                 // Find the absolute latest date within this product's timeseries
                 if (productTimeSeries.length > 0) {
                     productLatestDate = productTimeSeries.reduce((maxDate, currentEntry) => {
                         // Ensure dates are valid before comparison
                         const currentDate = new Date(currentEntry.metric_date);
                         // Handle potential invalid dates during comparison
                         const max = maxDate ? new Date(maxDate) : null;
                         if (isNaN(currentDate.getTime())) return maxDate; // Skip invalid current date
                         if (!max || isNaN(max.getTime())) return currentEntry.metric_date; // If maxDate is invalid or null, use current
                         return currentDate > max ? currentEntry.metric_date : maxDate;
                      }, null); // Initialize with null

                     // Get all entries matching that latest date for this product
                     if(productLatestDate) {
                        latestEntriesForProduct = productTimeSeries.filter(ts => ts.metric_date === productLatestDate);
                     }
                 }

                 fetchedLatestDataByProduct[productCode].lastDate = productLatestDate; // Set the determined latest date for this product

                 if (productLatestDate) {
                     ['PLASTICO', 'CARTA', 'ENVELOPE'].forEach(normalizedItemTypeKey => {
                         // Find the specific item entry for the latest date found above
                         const latestTimeSeriesEntry = latestEntriesForProduct.find(
                             ts => ts.item_type_normalized === normalizedItemTypeKey
                         );
                         // *** THIS IS THE KEY: Get the 'Saldo' directly from the latest timeseries entry ***
                         const saldoFromTimeSeries = latestTimeSeriesEntry?.value; // Value should be a number or null here

                         // Get other metrics (Est. Ant, Embossing) from the potentially separate aggregated endpoint result
                         const aggregatedItemData = latestAggregatedData[normalizedItemTypeKey] || {};

                         if (!fetchedLatestDataByProduct[productCode][normalizedItemTypeKey]) {
                             fetchedLatestDataByProduct[productCode][normalizedItemTypeKey] = {};
                         }

                         // Populate the KPI data object
                         fetchedLatestDataByProduct[productCode][normalizedItemTypeKey] = {
                             'Saldo': saldoFromTimeSeries !== undefined ? saldoFromTimeSeries : null, // Use the value from the latest timeseries point
                             'Estoque Dia Ant.': aggregatedItemData['Estoque Dia Ant.'] !== undefined ? aggregatedItemData['Estoque Dia Ant.'] : null, // Use from aggregated data
                             'Embossing': aggregatedItemData['Embossing'] !== undefined ? aggregatedItemData['Embossing'] : null, // Use from aggregated data
                         };
                     });
                 } else {
                     // If no time series data, clear out the item data as well
                     fetchedLatestDataByProduct[productCode].PLASTICO = {};
                     fetchedLatestDataByProduct[productCode].CARTA = {};
                     fetchedLatestDataByProduct[productCode].ENVELOPE = {};
                 }
             }

             // 3. Set the state used by the KPI panels
             setLatestStockMetricsByProduct(fetchedLatestDataByProduct);

             // 4. Recalculate low stock alerts based on the correct latest data
             const calculatedLowStockAlerts = {};
             for (const productCode of productKeys) {
                 const latestMetrics = fetchedLatestDataByProduct[productCode];
                 calculatedLowStockAlerts[productCode] = [];
                 if (latestMetrics.lastDate) { // Only calculate if there is data
                    const plasticoKey = latestMetrics.PLASTICO ? 'PLASTICO' : null;
                    if (plasticoKey && latestMetrics[plasticoKey]?.Saldo !== null && latestMetrics[plasticoKey]?.Saldo < STOCK_THRESHOLD) { calculatedLowStockAlerts[productCode].push('Plástico'); }
                    if (latestMetrics.CARTA?.Saldo !== null && latestMetrics.CARTA?.Saldo < STOCK_THRESHOLD) { calculatedLowStockAlerts[productCode].push('Carta'); }
                    if (latestMetrics.ENVELOPE?.Saldo !== null && latestMetrics.ENVELOPE?.Saldo < STOCK_THRESHOLD) { calculatedLowStockAlerts[productCode].push('Envelope'); }
                 }
             }
             setLowStockAlertItems(calculatedLowStockAlerts);

             // 5. Update Cache
             updateCache('estoque', periodKey, { latestStockMetricsByProduct: fetchedLatestDataByProduct, stockTimeSeriesByProduct: fetchedTimeSeriesDataByProduct, lowStockAlertItems: calculatedLowStockAlerts });

        } catch (err) {
            reportError(err, 'fetchAllStockData'); setError(`Falha ao carregar dados de estoque: ${err.message}`);
            setLatestStockMetricsByProduct({ click: { ...initialProductData }, mt: { ...initialProductData }, capital: { ...initialProductData } });
            setStockTimeSeriesByProduct({ click: [], mt: [], capital: [] }); setLowStockAlertItems({});
        } finally { setIsLoading(false); }
    }, [estoqueService, initialProductData, updateCache, cachedData, productKeys]);


    useEffect(() => { if (period.startDate && period.endDate) { fetchAllStockData(period.startDate, period.endDate); } }, [period.startDate, period.endDate, fetchAllStockData]);

    useEffect(() => { const handleResize = () => setIsMobileView(window.innerWidth < 768); window.addEventListener('resize', handleResize); handleResize(); return () => window.removeEventListener('resize', handleResize); }, []);

    useEffect(() => { const checkOverflow = (container) => container ? container.scrollWidth > container.clientWidth + 5 : false; const chartContainer = stockChartScrollContainerRef.current; const handleResize = () => checkOverflow(chartContainer); window.addEventListener('resize', handleResize); checkOverflow(chartContainer); return () => window.removeEventListener('resize', handleResize); }, [isChartExpanded, stockTimeSeriesByProduct[productKeys[activeProductTab]]]);

    const handleEstoqueUploadSuccess = async (processedMetrics) => { if (!processedMetrics || processedMetrics.length === 0) { setError("Nenhuma métrica válida processada do arquivo."); return; } setIsLoading(true); setError(null); try { const { error: dbError } = await estoqueService.addStockMetrics(processedMetrics); if (dbError) throw dbError; setShowUploader(false); const periodKey = `${period.startDate}_${period.endDate}`; updateCache('estoque', periodKey, null); await fetchAllStockData(period.startDate, period.endDate); } catch (err) { reportError(err, "handleEstoqueUploadSuccess"); setError(`Erro ao salvar dados no banco: ${err.message}`); } finally { setIsLoading(false); } };
    const toggleChartExpansion = () => setIsChartExpanded(prev => !prev);

    const formatDate = (dateString) => { if (!dateString) return ''; try { const date = new Date(dateString); if (isNaN(date.getTime())) return dateString; return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); } catch (e) { return dateString; } };
    // Format for chart tooltips and comparison values (precise, 3 decimals)
    const formatNumber = (value, decimals = 3) => { if (value === null || value === undefined || isNaN(Number(value))) return '-'; const num = Number(value); return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); };
    // Format for main KPI display (precise, 3 decimals, no 'K')
    const formatNumberKPI = (value) => {
        if (value === null || value === undefined || isNaN(Number(value))) return '-';
        const num = Number(value);
        // Display with 3 decimal places for KPIs, no rounding, no 'K'
        return num.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
     };
    const formatPercent = (value) => { if (value === null || value === undefined || isNaN(Number(value))) return '- %'; const num = Number(value); return num.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }); };

    const stockChartData = useMemo(() => {
        const productCode = productKeys[activeProductTab];
        // Use the state that was populated with numeric values and sorted
        const currentStockTimeSeries = stockTimeSeriesByProduct[productCode] || [];
        if (!currentStockTimeSeries || currentStockTimeSeries.length === 0) return { labels: [], datasets: [] };

        // Data should already be processed correctly, ensure labels are sorted
        const sortedTimeSeries = [...currentStockTimeSeries].sort((a, b) => new Date(a.metric_date) - new Date(b.metric_date));
        const allLabels = [...new Set(sortedTimeSeries.map(d => d.metric_date))].sort((a,b) => new Date(a) - new Date(b));

        const itemTypes = ['PLASTICO', 'CARTA', 'ENVELOPE'];
        const colors = { 'PLASTICO': '#a855f7', 'CARTA': '#f97316', 'ENVELOPE': '#64748b' };
        const fullFormattedLabels = allLabels.map(l => new Date(l + 'T00:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
        let labelsToShow = fullFormattedLabels; if (!isMobileView && !isChartExpanded && allLabels.length > 3) { labelsToShow = fullFormattedLabels.slice(-3); }

        const datasets = itemTypes.map(itemType => {
            const fullDataPoints = allLabels.map(label => {
                // Find the point using the pre-normalized key
                const point = sortedTimeSeries.find(d => d.metric_date === label && (d.item_type_normalized === itemType));
                return point ? point.value : null; // value is already number or null
             });
            let dataPointsToShow = fullDataPoints; if (!isMobileView && !isChartExpanded && allLabels.length > 3) { dataPointsToShow = fullDataPoints.slice(-3); }
            const pointRadius = allLabels.length > 30 ? (isChartExpanded ? 1 : 0) : 3;
            return { label: itemType === 'PLASTICO' ? 'Plástico' : itemType.charAt(0) + itemType.slice(1).toLowerCase(), data: dataPointsToShow, borderColor: colors[itemType] || '#cccccc', backgroundColor: `${colors[itemType] || '#cccccc'}33`, tension: 0.1, fill: false, pointRadius, pointHoverRadius: 5, spanGaps: true };
        });

        return { labels: labelsToShow, datasets };
    }, [stockTimeSeriesByProduct, activeProductTab, isChartExpanded, isMobileView, productKeys]);

    const stockChartOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { autoSkip: !isChartExpanded, maxRotation: (isMobileView || isChartExpanded) ? 60 : 0, font: { size: 10 }, padding: 5 } }, y: { beginAtZero: false, title: { display: true, text: 'Saldo', font: { size: 11 } }, ticks: { font: { size: 10 }, callback: function(value) { if (value >= 1000) { return (value / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + 'k'; } return value.toLocaleString('pt-BR'); } } } }, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } }, tooltip: { callbacks: { label: function(context) { let label = context.dataset.label || ''; if (label) { label += ': '; } if (context.parsed.y !== null) { label += formatNumber(context.parsed.y, 3); } return label; } } }, annotation: { annotations: { line1: { type: 'line', yMin: STOCK_THRESHOLD, yMax: STOCK_THRESHOLD, borderColor: 'rgb(239, 68, 68, 0.8)', borderWidth: 2, borderDash: [6, 6], label: { content: `Mínimo (${formatNumber(STOCK_THRESHOLD, 0)})`, display: true, position: 'end', backgroundColor: 'rgba(239, 68, 68, 0.8)', font: { size: 9 }, padding: { x: 4, y: 2 }, yAdjust: -5 } } } } } }), [isMobileView, isChartExpanded]);
    const stockChartMinWidth = isChartExpanded ? `${Math.max(600, (stockChartData?.labels?.length || 0) * (isMobileView ? 35 : 50))}px` : '100%';

    const stockMobileSummaryData = useMemo(() => {
        const productCode = productKeys[activeProductTab];
        const latestMetrics = latestStockMetricsByProduct[productCode];
        if (!latestMetrics || !latestMetrics.lastDate) return [];
        const plasticoKey = latestMetrics.PLASTICO ? 'PLASTICO' : (latestMetrics['PLÁSTICO'] ? 'PLASTICO' : (latestMetrics['PLÃ STICO'] ? 'PLASTICO' : null)); const plasticoSaldo = plasticoKey ? latestMetrics[plasticoKey]?.Saldo : 0; const cartaSaldo = latestMetrics.CARTA?.Saldo || 0; const envelopeSaldo = latestMetrics.ENVELOPE?.Saldo || 0; const totalSaldo = (plasticoSaldo || 0) + cartaSaldo + envelopeSaldo; const formatItem = (label, value) => ({ label: `${label} (% Saldo)`, value: totalSaldo > 0 ? (value || 0) / totalSaldo : 0, isPercent: true }); return [ plasticoKey ? formatItem('Plástico', plasticoSaldo) : null, formatItem('Carta', cartaSaldo), formatItem('Envelope', envelopeSaldo) ].filter(item => item && item.value !== null && item.value !== undefined);
    }, [latestStockMetricsByProduct, activeProductTab, productKeys]);

    const renderNoDataMessage = (message) => (<div className="flex items-center justify-center h-full text-center py-12 text-gray-500"><div><i className="fas fa-info-circle text-4xl mb-4"></i><p>{message}</p></div></div>);
    const renderLoading = (message) => (<div className="flex items-center justify-center h-full text-center py-12 text-gray-500"><div><i className="fas fa-spinner fa-spin text-4xl mb-4"></i><p>{message}</p></div></div>);
    const canUpload = user && user.role !== 'guest';

    function renderContent(productTabKey) {
        // Use the state specifically populated for KPIs
        const latestMetrics = latestStockMetricsByProduct[productTabKey];
        const hasLatestData = latestMetrics && latestMetrics.lastDate;
        const currentLowStockItems = lowStockAlertItems[productTabKey] || [];
        // Use the state specifically populated for Charts
        const hasTimeSeriesData = stockTimeSeriesByProduct[productTabKey] && stockTimeSeriesByProduct[productTabKey].length > 0;
        // Determine the key for PLASTICO for display, handling potential variations if needed (though normalized now)
        const plasticoKeyForKPI = latestMetrics?.PLASTICO ? 'PLASTICO' : null;







        const mobileSummaryDataForTab = useMemo(() => {
            if (!latestMetrics || !latestMetrics.lastDate) return [];
            const plasticoKey = latestMetrics.PLASTICO ? 'PLASTICO' : null;
            const plasticoSaldo = plasticoKey ? latestMetrics[plasticoKey]?.Saldo : 0;
            const cartaSaldo = latestMetrics.CARTA?.Saldo || 0;
            const envelopeSaldo = latestMetrics.ENVELOPE?.Saldo || 0;
            const totalSaldo = (plasticoSaldo || 0) + cartaSaldo + envelopeSaldo;
            const formatItem = (label, value) => ({ label: `${label} (% Saldo)`, value: totalSaldo > 0 ? (value || 0) / totalSaldo : 0, isPercent: true }); return [ plasticoKey ? formatItem('Plástico', plasticoSaldo) : null, formatItem('Carta', cartaSaldo), formatItem('Envelope', envelopeSaldo) ].filter(item => item && item.value !== null && item.value !== undefined);
        }, [latestMetrics]);

        return (
            <React.Fragment>
                {!isLoading && currentLowStockItems.length > 0 && (
                    <div className="my-4 p-4 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded" role="alert">
                        <i className="fas fa-exclamation-triangle mr-2"></i>
                         <span className='font-semibold'>Estoque baixo!</span> Item(ns) abaixo de {formatNumber(STOCK_THRESHOLD, 0)} em {formatDate(latestMetrics?.lastDate)}: {currentLowStockItems.join(', ')}.
                     </div>
                )}

                {error && ( <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded" role="alert"> <i className="fas fa-exclamation-triangle mr-2"></i> Erro: {error} </div> )}

                {isLoading && activeProductTab === productKeys.indexOf(productTabKey) && renderLoading("Carregando KPIs...")}
                {!isLoading && !error && !hasLatestData && activeProductTab === productKeys.indexOf(productTabKey) && renderNoDataMessage("Nenhum dado de estoque encontrado para o período.")}

                {!isLoading && !error && hasLatestData && (
                     <div className="mb-6">
                         <h3 className="text-xl font-semibold text-gray-800 mb-4">Saldo em {formatDate(latestMetrics?.lastDate)}</h3>
                         <div className="kpi-grid grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* Use formatNumberKPI for the main KPI value */}
                            {plasticoKeyForKPI && latestMetrics[plasticoKeyForKPI] ? <KPIPanel title="Plástico" value={formatNumberKPI(latestMetrics[plasticoKeyForKPI]?.Saldo)} comparison={`Est. Ant: ${formatNumberKPI(latestMetrics[plasticoKeyForKPI]?.['Estoque Dia Ant.'])} | Saída: ${formatNumber(latestMetrics[plasticoKeyForKPI]?.Embossing, 3)}`} /> : <KPIPanel title="Plástico" value="-" comparison="-" />}
                            {latestMetrics.CARTA ? <KPIPanel title="Carta" value={formatNumberKPI(latestMetrics.CARTA?.Saldo)} comparison={`Est. Ant: ${formatNumberKPI(latestMetrics.CARTA?.['Estoque Dia Ant.'])} | Saída: ${formatNumber(latestMetrics.CARTA?.Embossing, 3)}`} /> : <KPIPanel title="Carta" value="-" comparison="-"/> }
                            {latestMetrics.ENVELOPE ? <KPIPanel title="Envelope" value={formatNumberKPI(latestMetrics.ENVELOPE?.Saldo)} comparison={`Est. Ant: ${formatNumberKPI(latestMetrics.ENVELOPE?.['Estoque Dia Ant.'])} | Saída: ${formatNumber(latestMetrics.ENVELOPE?.Embossing, 3)}`} /> : <KPIPanel title="Envelope" value="-" comparison="-"/> }
                         </div>
                     </div>
                 )}

                {!isLoading && !error && (
                    <div className="bg-white p-4 rounded-lg shadow-md flex flex-col min-h-[400px] mb-6">
                        <div className="flex justify-between items-center mb-4">
                             <h3 className="text-base font-semibold text-gray-700">Tendência de Saldo (Período)</h3>
                             {hasTimeSeriesData && ( <button onClick={toggleChartExpansion} className="btn btn-secondary btn-xs py-1 px-2">{isChartExpanded ? 'Ver Resumo' : 'Ver Gráfico'}</button> )}
                         </div>

                        {(!isChartExpanded && isMobileView && hasTimeSeriesData) ? (
                             <ChartMobileSummary title="Distribuição Saldo (Últ. Dia)" data={mobileSummaryDataForTab} onExpandClick={toggleChartExpansion} expandButtonText="Ver Gráfico" />
                         ) : (
                             <div className="flex-grow relative h-[350px]">
                                <div ref={stockChartScrollContainerRef} className={`absolute inset-0 ${isChartExpanded ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
                                     {productKeys[activeProductTab] === productTabKey && hasTimeSeriesData ? (
                                         <div style={{ minWidth: stockChartMinWidth, height: '100%' }} className="relative">
                                             {/* Chart uses stockChartData which pulls from stockTimeSeriesByProduct */}
                                             <ChartComponent type="line" data={stockChartData} options={stockChartOptions} />
                                         </div>
                                      ) : !hasTimeSeriesData && activeProductTab === productKeys.indexOf(productTabKey) ? renderNoDataMessage("Sem dados de saldo para o gráfico.") : null}
                                 </div>
                            </div>
                        )}
                    </div>
                )}

                {!isLoading && !error && !hasTimeSeriesData && activeProductTab === productKeys.indexOf(productTabKey) && renderNoDataMessage("Sem dados de saldo para exibir no gráfico.")}
            </React.Fragment>
        );
    }

    return (
        <div className="min-h-screen">
            <LoadingOverlay isLoading={isLoading} message="Processando..." />
            <main className="p-4 lg:p-6">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 lg:mb-0">Relatório de Estoque</h2>
                    <div className="flex space-x-2">
                        {canUpload && (
                            <button onClick={() => setShowUploader(prev => !prev)} className={`btn ${showUploader ? 'btn-secondary' : 'btn-primary'} btn-icon`} data-name="toggle-estoque-uploader-button">
                                <i className={`fas ${showUploader ? 'fa-times' : 'fa-upload'}`}></i>
                                <span>{showUploader ? 'Fechar Upload' : 'Carregar Estoque'}</span>
                            </button>
                        )}
                    </div>
                </div>

                {showUploader && canUpload && ( <div className="my-6"> <FileUploaderEstoque onFileUpload={handleEstoqueUploadSuccess} user={user} onClose={() => setShowUploader(false)} /> </div> )}

                <PeriodFilter />

                <Tabs selectedIndex={activeProductTab} onSelect={index => setActiveProductTab(index)} className="mb-4">
                    <TabList className="flex space-x-2 border-b border-gray-200 mb-3">
                        <Tab className={`react-tabs__tab py-2 px-4 cursor-pointer text-sm font-medium ${activeProductTab === 0 ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>Click</Tab>
                        <Tab className={`react-tabs__tab py-2 px-4 cursor-pointer text-sm font-medium ${activeProductTab === 1 ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>MT Card</Tab>
                        <Tab className={`react-tabs__tab py-2 px-4 cursor-pointer text-sm font-medium ${activeProductTab === 2 ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>Capital Consig</Tab>
                    </TabList>
                    <TabPanel>{renderContent('click')}</TabPanel>
                    <TabPanel>{renderContent('mt')}</TabPanel>
                    <TabPanel>{renderContent('capital')}</TabPanel>
                </Tabs>
            </main>
        </div>
    );
}

export default Estoque;