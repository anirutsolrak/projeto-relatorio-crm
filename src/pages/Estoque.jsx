import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Chart } from 'chart.js/auto'; // Import Chart object
import AnnotationPlugin from 'chartjs-plugin-annotation'; // Import plugin
import LoadingOverlay from '../components/LoadingOverlay';
import PeriodFilter from '../components/PeriodFilter';
import FileUploaderEstoque from '../components/FileUploaderEstoque';
import EstoqueService from '../utils/EstoqueService';
import KPIPanel from '../components/KPIPanel';
import ChartComponent from '../components/ChartComponent';
import TruncatedTextWithPopover from '../components/TruncatedTextWithPopover';

// Registra o plugin DEPOIS de importar Chart
Chart.register(AnnotationPlugin);

// Componente Resumo Mobile Ajustado para mostrar porcentagens
function ChartMobileSummary({ title, data = [], onExpandClick, expandButtonText }) {
    const formatValue = (val, isPercent = false) => {
        if (val === null || val === undefined || isNaN(Number(val))) return '-';
        const num = Number(val);
        const options = isPercent
            ? { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }
            : { minimumFractionDigits: 0, maximumFractionDigits: 0 };
        return num.toLocaleString('pt-BR', options);
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow-md h-full flex flex-col justify-between min-h-[200px]">
            <div>
                <h3 className="text-base font-semibold text-gray-700 mb-4">{title}</h3>
                <div className="space-y-1 text-sm max-h-48 overflow-y-auto pr-2">
                    {data.map((item, index) => (
                         <div key={index} className="flex justify-between">
                            <TruncatedTextWithPopover className="text-gray-500 mr-2" title={item.label}>
                                {item.label}:
                            </TruncatedTextWithPopover>
                            <span className="font-medium flex-shrink-0">{formatValue(item.value, item.isPercent)}</span>
                        </div>
                    ))}
                    {data.length === 0 && <p className='text-gray-400 text-xs italic'>Nenhum dado para resumir.</p>}
                </div>
            </div>
            {onExpandClick && (
                 <div className="mt-4 text-right">
                    <button onClick={onExpandClick} className="btn btn-secondary btn-xs py-1 px-2">
                        {expandButtonText || "Ver Gráfico"}
                    </button>
                </div>
            )}
        </div>
    );
}


function Estoque({ user, onNavigate }) {
    const reportError = (error, context = 'EstoquePage') => console.error(`[${context}] Error:`, error?.message || error);
    const estoqueService = useMemo(() => EstoqueService(), []);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [latestStockMetrics, setLatestStockMetrics] = useState({ PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null });
    const [stockTimeSeries, setStockTimeSeries] = useState([]);
    const [showUploader, setShowUploader] = useState(false);
    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
    const [isChartExpanded, setIsChartExpanded] = useState(false);
    const stockChartScrollContainerRef = useRef(null);
    const [lowStockAlertItems, setLowStockAlertItems] = useState([]);

    const STOCK_THRESHOLD = 50;

    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(new Date().setDate(new Date().getDate() - 6)).toISOString().split('T')[0];
    const [period, setPeriod] = useState({ startDate: defaultStartDate, endDate: defaultEndDate });

    const fetchAllStockData = useCallback(async (startDate, endDate) => {
        console.log(`[fetchAllStockData - Estoque] Buscando dados para período: ${startDate} a ${endDate}`);
        if (!estoqueService) { setIsLoading(false); setError("Erro interno: Serviço não inicializado."); return; }
        setIsLoading(true); setError(null);
        setLatestStockMetrics({ PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null });
        setStockTimeSeries([]);
        setLowStockAlertItems([]);

        try {
            const [latestResult, timeSeriesResult] = await Promise.all([
                estoqueService.getLatestStockMetrics(startDate, endDate),
                estoqueService.getStockTimeSeries(startDate, endDate)
            ]);

            console.log("[fetchAllStockData - Estoque] Resultados:", { latestResult, timeSeriesResult });

            const errors = [];
            if (latestResult.error) errors.push(`KPIs Último Dia: ${latestResult.error.message || 'Erro desconhecido'}`);
            if (timeSeriesResult.error) errors.push(`Série Temporal: ${timeSeriesResult.error.message || 'Erro desconhecido'}`);

            if (errors.length > 0) {
                throw new Error(errors.join('; '));
            }

            const latestData = latestResult.data || { PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null };
            setLatestStockMetrics(latestData);
            setStockTimeSeries(timeSeriesResult.data || []);

            const itemsBelowThreshold = [];
            const plasticoKey = latestData.PLASTICO ? 'PLASTICO' : (latestData['PLÃ STICO'] ? 'PLASTICO' : null);
            if (plasticoKey && latestData[plasticoKey]?.Saldo < STOCK_THRESHOLD) {
                itemsBelowThreshold.push('Plástico');
            }
            if (latestData.CARTA?.Saldo < STOCK_THRESHOLD) {
                itemsBelowThreshold.push('Carta');
            }
            if (latestData.ENVELOPE?.Saldo < STOCK_THRESHOLD) {
                itemsBelowThreshold.push('Envelope');
            }
            setLowStockAlertItems(itemsBelowThreshold);
            if (itemsBelowThreshold.length > 0) {
                console.warn(`[Estoque Alert] Itens abaixo de ${STOCK_THRESHOLD} em ${latestData.lastDate}:`, itemsBelowThreshold);
            }

        } catch (err) {
            reportError(err, 'fetchAllStockData');
            setError(`Falha ao carregar dados de estoque: ${err.message}`);
            setLatestStockMetrics({ PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null });
            setStockTimeSeries([]);
            setLowStockAlertItems([]);
        } finally {
            setIsLoading(false);
            console.log("[fetchAllStockData - Estoque] Busca finalizada.");
        }
    }, [estoqueService]);

    useEffect(() => {
        fetchAllStockData(period.startDate, period.endDate);
    }, [period.startDate, period.endDate, fetchAllStockData]);

    useEffect(() => {
        const handleResize = () => setIsMobileView(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const checkOverflow = (container) => container ? container.scrollWidth > container.clientWidth + 5 : false;
        const chartContainer = stockChartScrollContainerRef.current;
        const handleResize = () => { checkOverflow(chartContainer); }
        window.addEventListener('resize', handleResize); checkOverflow(chartContainer);
        return () => window.removeEventListener('resize', handleResize);
    }, [isChartExpanded, stockTimeSeries]);

    const handlePeriodChange = useCallback((newPeriod) => {
        console.log("[handlePeriodChange - Estoque] Novas datas:", newPeriod);
        if (!newPeriod.startDate || !newPeriod.endDate || new Date(newPeriod.endDate) < new Date(newPeriod.startDate)) {
            setError("Datas inválidas selecionadas.");
            return;
        }
        setError(null);
        setPeriod({ startDate: newPeriod.startDate, endDate: newPeriod.endDate });
    }, []);

    const handleEstoqueUploadSuccess = async (processedMetrics) => {
        if (!processedMetrics || processedMetrics.length === 0) {
            setError("Nenhuma métrica válida processada do arquivo.");
            return;
        }
        setIsLoading(true); setError(null);
        try {
            const { error: dbError } = await estoqueService.addStockMetrics(processedMetrics);
            if (dbError) throw dbError;
            console.log("[EstoquePage] Métricas de estoque salvas com sucesso!");
            setShowUploader(false);
            await fetchAllStockData(period.startDate, period.endDate);
        } catch (err) {
            reportError(err, "handleEstoqueUploadSuccess");
            setError(`Erro ao salvar dados no banco: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleChartExpansion = () => setIsChartExpanded(prev => !prev);

    const formatDate = (dateString) => { if (!dateString) return ''; try { const date = new Date(dateString); if (isNaN(date.getTime())) return dateString; return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); } catch (e) { return dateString; } };
    const formatNumber = (value, decimals = 3) => {
        if (value === null || value === undefined || isNaN(Number(value))) return '-';
        const num = Number(value);
        return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    };
    const formatPercent = (value) => {
         if (value === null || value === undefined || isNaN(Number(value))) return '- %';
         const num = Number(value);
         return num.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    };

    // --- Dados e Opções dos Gráficos ---
    const stockChartData = useMemo(() => {
        if (!stockTimeSeries || stockTimeSeries.length === 0) return { labels: [], datasets: [] };
        const allLabels = [...new Set(stockTimeSeries.map(d => d.metric_date))].sort();
        const itemTypes = ['PLASTICO', 'CARTA', 'ENVELOPE'];
        const colors = { 'PLASTICO': '#a855f7', 'CARTA': '#f97316', 'ENVELOPE': '#64748b' };
        const fullFormattedLabels = allLabels.map(l => new Date(l + 'T00:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
        let labelsToShow = fullFormattedLabels;
        if (!isMobileView && !isChartExpanded && allLabels.length > 3) { labelsToShow = fullFormattedLabels.slice(-3); }

        const datasets = itemTypes.map(itemType => {
            const fullDataPoints = allLabels.map(label => {
                 const point = stockTimeSeries.find(d => d.metric_date === label && (d.item_type?.toUpperCase() === itemType || (itemType === 'PLASTICO' && ['PLÁSTICO', 'PLÃ STICO'].includes(d.item_type?.toUpperCase()))));
                return point ? point.value : null;
            });
            let dataPointsToShow = fullDataPoints;
            if (!isMobileView && !isChartExpanded && allLabels.length > 3) { dataPointsToShow = fullDataPoints.slice(-3); }
            const pointRadius = allLabels.length > 30 ? (isChartExpanded ? 1 : 0) : 3;
            return {
                 label: itemType === 'PLASTICO' ? 'Plástico' : itemType.charAt(0) + itemType.slice(1).toLowerCase(),
                 data: dataPointsToShow,
                 borderColor: colors[itemType] || '#cccccc',
                 backgroundColor: `${colors[itemType] || '#cccccc'}33`,
                 tension: 0.1, fill: false, pointRadius: pointRadius, pointHoverRadius: 5, spanGaps: true,
             };
        });
        return { labels: labelsToShow, datasets };
     }, [stockTimeSeries, isChartExpanded, isMobileView]);

    const stockChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: {
            x: { ticks: { autoSkip: !isChartExpanded, maxRotation: (isMobileView || isChartExpanded) ? 60 : 0, font: { size: 10 }, padding: 5 } },
            y: {
                beginAtZero: false, // Não força começar em zero para estoque
                title: { display: true, text: 'Saldo', font: { size: 11 } },
                ticks: {
                    font: { size: 10 },
                    // Formatação customizada para eixo Y (Saldo)
                    callback: function(value) {
                         if (value >= 1000) {
                             return (value / 1000).toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 1}) + 'k';
                         }
                         return value.toLocaleString('pt-BR'); // Usa formatação padrão para valores menores
                     }
                }
            }
        },
        plugins: {
            legend: { position: 'bottom', labels: { font: {size: 11}, usePointStyle: true, pointStyleWidth: 8 } },
            annotation: {
                 annotations: {
                     line1: {
                         type: 'line',
                         yMin: STOCK_THRESHOLD,
                         yMax: STOCK_THRESHOLD,
                         borderColor: 'rgb(239, 68, 68, 0.8)',
                         borderWidth: 2,
                         borderDash: [6, 6],
                         label: {
                             content: `Mínimo (${formatNumber(STOCK_THRESHOLD, 0 )})`+ `k`,
                             display: true,
                             position: 'end',
                             backgroundColor: 'rgba(239, 68, 68, 0.8)',
                             font: { size: 9 },
                             padding: { x:4, y:2 },
                             yAdjust: -5
                         }
                     }
                 }
             }
         }
    }), [isMobileView, isChartExpanded]); // Adicionado STOCK_THRESHOLD implicitamente como dependência da string no label

    const stockChartMinWidth = isChartExpanded ? `${Math.max(600, (stockChartData?.labels?.length || 0) * (isMobileView ? 35 : 50))}px` : '100%';

    const stockMobileSummaryData = useMemo(() => {
        if (!latestStockMetrics || !latestStockMetrics.lastDate) return [];
        const plasticoKey = latestStockMetrics.PLASTICO ? 'PLASTICO' : (latestStockMetrics['PLÃ STICO'] ? 'PLASTICO' : null);
        const plasticoSaldo = plasticoKey ? latestStockMetrics[plasticoKey]?.Saldo : 0;
        const cartaSaldo = latestStockMetrics.CARTA?.Saldo || 0;
        const envelopeSaldo = latestStockMetrics.ENVELOPE?.Saldo || 0;
        const totalSaldo = (plasticoSaldo || 0) + cartaSaldo + envelopeSaldo;

        const formatItem = (label, value) => ({
            label: `${label} (% Saldo)`,
            value: totalSaldo > 0 ? (value || 0) / totalSaldo : 0,
            isPercent: true
        });

        return [
            plasticoKey ? formatItem('Plástico', plasticoSaldo) : null,
            formatItem('Carta', cartaSaldo),
            formatItem('Envelope', envelopeSaldo),
        ].filter(item => item && item.value !== null && item.value !== undefined);
    }, [latestStockMetrics]);

    const renderNoDataMessage = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-info-circle text-4xl mb-4"></i> <p>{message}</p></div> </div> );
    const renderLoading = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-spinner fa-spin text-4xl mb-4"></i> <p>{message}</p></div> </div> );

    const canUpload = user && user.role !== 'guest';
    const hasLatestData = latestStockMetrics && latestStockMetrics.lastDate;
    const hasTimeSeriesData = stockTimeSeries && stockTimeSeries.length > 0;
    const plasticoKeyForKPI = latestStockMetrics.PLASTICO ? 'PLASTICO' : (latestStockMetrics['PLÃ STICO'] ? 'PLASTICO' : null);

    console.log("[Estoque Render] latestStockMetrics:", latestStockMetrics);
    console.log("[Estoque Render] stockChartData:", stockChartData);
    console.log("[Estoque Render] lowStockAlertItems:", lowStockAlertItems);

    return (
        <div className="min-h-screen">
            <LoadingOverlay isLoading={isLoading} message="Processando..." />
            <main className="p-4 lg:p-6">
                {/* Cabeçalho */}
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 lg:mb-0">
                        Relatório de Estoque
                    </h2>
                    <div className="flex space-x-2">
                         {canUpload && (
                             <button
                                 onClick={() => setShowUploader(prev => !prev)}
                                 className={`btn ${showUploader ? 'btn-secondary' : 'btn-primary'} btn-icon`}
                                 data-name="toggle-estoque-uploader-button"
                             >
                                 <i className={`fas ${showUploader ? 'fa-times' : 'fa-upload'}`}></i>
                                 <span>{showUploader ? 'Fechar Upload' : 'Carregar Estoque'}</span>
                             </button>
                         )}
                    </div>
                </div>

                {/* Uploader */}
                {showUploader && canUpload && (
                    <div className="my-6">
                        <FileUploaderEstoque
                            onFileUpload={handleEstoqueUploadSuccess}
                            user={user}
                            onClose={() => setShowUploader(false)}
                        />
                    </div>
                )}

                 {/* Filtro de Período */}
                 <PeriodFilter onPeriodChange={handlePeriodChange} initialPeriod={period} />

                {/* Alerta de Estoque Baixo */}
                 {!isLoading && lowStockAlertItems.length > 0 && (
                     <div className="my-4 p-4 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded" role="alert">
                         <i className="fas fa-exclamation-triangle mr-2"></i>
                         <span className='font-semibold'>Estoque baixo!</span> Item(ns) abaixo de {formatNumber(STOCK_THRESHOLD, 0)} em {formatDate(latestStockMetrics.lastDate)}: {lowStockAlertItems.join(', ')}.
                     </div>
                 )}

                {error && (
                    <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded" role="alert">
                        <i className="fas fa-exclamation-triangle mr-2"></i> Erro: {error}
                    </div>
                )}

                {/* --- KPIs de Estoque (Último Dia) --- */}
                {isLoading && renderLoading("Carregando KPIs...")}
                {!isLoading && !error && !hasLatestData && renderNoDataMessage("Nenhum dado de estoque encontrado para o período.")}
                {!isLoading && !error && hasLatestData && (
                    <div className="mb-6">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Saldo em {formatDate(latestStockMetrics.lastDate)}</h3>
                        <div className="kpi-grid grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {plasticoKeyForKPI && <KPIPanel title="Plástico" value={formatNumber(latestStockMetrics[plasticoKeyForKPI]?.Saldo, 3)} comparison={`Est. Ant: ${formatNumber(latestStockMetrics[plasticoKeyForKPI]?.['Estoque Dia Ant.'], 3)} | Saída: ${formatNumber(latestStockMetrics[plasticoKeyForKPI]?.Embossing, 3)}`} />}
                            {!plasticoKeyForKPI && <KPIPanel title="Plástico" value="-" comparison="-" />}
                            <KPIPanel title="Carta" value={formatNumber(latestStockMetrics.CARTA?.Saldo, 3)} comparison={`Est. Ant: ${formatNumber(latestStockMetrics.CARTA?.['Estoque Dia Ant.'], 3)} | Saída: ${formatNumber(latestStockMetrics.CARTA?.Embossing, 3)}`} />
                            <KPIPanel title="Envelope" value={formatNumber(latestStockMetrics.ENVELOPE?.Saldo, 3)} comparison={`Est. Ant: ${formatNumber(latestStockMetrics.ENVELOPE?.['Estoque Dia Ant.'], 3)} | Saída: ${formatNumber(latestStockMetrics.ENVELOPE?.Embossing, 3)}`}/>
                        </div>
                    </div>
                )}

                 {/* --- Gráfico de Tendência do Saldo --- */}
                 {!isLoading && !error && (
                    <div className="bg-white p-4 rounded-lg shadow-md flex flex-col min-h-[400px] mb-6">
                         <div className="flex justify-between items-center mb-4">
                             <h3 className="text-base font-semibold text-gray-700">Tendência de Saldo (Período)</h3>
                             {hasTimeSeriesData && (
                                 <button onClick={toggleChartExpansion} className="btn btn-secondary btn-xs py-1 px-2">
                                     {isChartExpanded ? 'Ver Resumo' : 'Ver Gráfico'}
                                 </button>
                             )}
                         </div>
                          {(!isChartExpanded && isMobileView && hasTimeSeriesData) ? (
                              <ChartMobileSummary
                                  title="Distribuição Saldo (Últ. Dia)"
                                  data={stockMobileSummaryData}
                                  onExpandClick={toggleChartExpansion}
                                  expandButtonText="Ver Gráfico"
                              />
                          ) : (
                             <div className="flex-grow relative h-[350px]">
                                 <div ref={stockChartScrollContainerRef} className={`absolute inset-0 ${isChartExpanded ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
                                     <div style={{ minWidth: stockChartMinWidth, height: '100%' }} className="relative">
                                         {hasTimeSeriesData ? <ChartComponent type="line" data={stockChartData} options={stockChartOptions} /> : renderNoDataMessage("Sem dados de saldo para o gráfico.")}
                                     </div>
                                 </div>
                             </div>
                         )}
                    </div>
                )}
                {!isLoading && !error && !hasTimeSeriesData && renderNoDataMessage("Sem dados de saldo para exibir no gráfico.")}

            </main>
        </div>
    );
}

export default Estoque;