import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import PeriodFilter from '../components/PeriodFilter';
import FileUploaderEstoque from '../components/FileUploaderEstoque';
import EstoqueService from '../utils/EstoqueService';
import KPIPanel from '../components/KPIPanel';
import ChartComponent from '../components/ChartComponent';
import TruncatedTextWithPopover from '../components/TruncatedTextWithPopover';

// Componente Resumo Mobile (Genérico)
function ChartMobileSummary({ title, data = [], onExpandClick, expandButtonText }) {
    const formatValue = (val) => (val === null || val === undefined || isNaN(Number(val)) ? '-' : Number(val).toLocaleString('pt-BR'));

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
                            <span className="font-medium flex-shrink-0">{formatValue(item.value)}</span>
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

    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(new Date().setDate(new Date().getDate() - 6)).toISOString().split('T')[0];
    const [period, setPeriod] = useState({ startDate: defaultStartDate, endDate: defaultEndDate });

    const fetchAllStockData = useCallback(async (startDate, endDate) => {
        console.log(`[fetchAllStockData - Estoque] Buscando dados para período: ${startDate} a ${endDate}`);
        if (!estoqueService) { setIsLoading(false); setError("Erro interno: Serviço não inicializado."); return; }
        setIsLoading(true); setError(null);
        setLatestStockMetrics({ PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null });
        setStockTimeSeries([]);

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

            setLatestStockMetrics(latestResult.data || { PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null });
            setStockTimeSeries(timeSeriesResult.data || []);

        } catch (err) {
            reportError(err, 'fetchAllStockData');
            setError(`Falha ao carregar dados de estoque: ${err.message}`);
            setLatestStockMetrics({ PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null });
            setStockTimeSeries([]);
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
    // Ajustado formatNumber para aceitar casas decimais
    const formatNumber = (value, decimals = 3) => { // Default para 3 casas decimais
        if (value === null || value === undefined || isNaN(Number(value))) return '-';
        const num = Number(value);
        return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
                 // Normalização explícita aqui também para segurança
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
     }, [stockTimeSeries, isChartExpanded, isMobileView]); // Dependências corretas

    const stockChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: {
            x: { ticks: { autoSkip: !isChartExpanded, maxRotation: (isMobileView || isChartExpanded) ? 60 : 0, font: { size: 10 }, padding: 5 } },
            y: { beginAtZero: false, title: { display: true, text: 'Saldo', font: { size: 11 } }, ticks: { font: { size: 10 }, callback: (val) => formatNumber(val, 0) } } // Formata eixo Y sem decimais
        },
        plugins: { legend: { position: 'bottom', labels: { font: {size: 11}, usePointStyle: true, pointStyleWidth: 8 } } }
    }), [isMobileView, isChartExpanded]);

    const stockChartMinWidth = isChartExpanded ? `${Math.max(600, (stockChartData?.labels?.length || 0) * (isMobileView ? 35 : 50))}px` : '100%';

    const stockMobileSummaryData = useMemo(() => {
        if (!latestStockMetrics || !latestStockMetrics.lastDate) return [];
        const plasticoKey = latestStockMetrics.PLASTICO ? 'PLASTICO' : (latestStockMetrics['PLÃ STICO'] ? 'PLASTICO' : null); // Usa a chave normalizada
        return [
            plasticoKey ? { label: 'Plástico (Saldo)', value: latestStockMetrics[plasticoKey]?.Saldo } : null,
            { label: 'Carta (Saldo)', value: latestStockMetrics.CARTA?.Saldo },
            { label: 'Envelope (Saldo)', value: latestStockMetrics.ENVELOPE?.Saldo },
        ].filter(item => item && item.value !== null && item.value !== undefined);
    }, [latestStockMetrics]);

    const renderNoDataMessage = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-info-circle text-4xl mb-4"></i> <p>{message}</p></div> </div> );
    const renderLoading = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-spinner fa-spin text-4xl mb-4"></i> <p>{message}</p></div> </div> );

    const canUpload = user && user.role !== 'guest';
    const hasLatestData = latestStockMetrics && latestStockMetrics.lastDate;
    const hasTimeSeriesData = stockTimeSeries && stockTimeSeries.length > 0;

     const plasticoKeyForKPI = latestStockMetrics.PLASTICO ? 'PLASTICO' : (latestStockMetrics['PLÃ STICO'] ? 'PLASTICO' : null); // Usa a chave normalizada consistentemente

     // Log para depurar dados finais antes da renderização
     console.log("[Estoque Render] latestStockMetrics:", latestStockMetrics);
     console.log("[Estoque Render] stockChartData:", stockChartData);

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
                            {/* Especifica 3 casas decimais para os valores */}
                            {plasticoKeyForKPI && <KPIPanel title="Plástico" value={formatNumber(latestStockMetrics[plasticoKeyForKPI]?.Saldo, 3)} comparison={`Est. Ant: ${formatNumber(latestStockMetrics[plasticoKeyForKPI]?.['Estoque Dia Ant.'], 3)} | Emb: ${formatNumber(latestStockMetrics[plasticoKeyForKPI]?.Embossing, 3)}`} />}
                            {!plasticoKeyForKPI && <KPIPanel title="Plástico" value="-" comparison="-" />} {/* Placeholder se não encontrar */}
                            <KPIPanel title="Carta" value={formatNumber(latestStockMetrics.CARTA?.Saldo, 3)} comparison={`Est. Ant: ${formatNumber(latestStockMetrics.CARTA?.['Estoque Dia Ant.'], 3)} | Emb: ${formatNumber(latestStockMetrics.CARTA?.Embossing, 3)}`} />
                            <KPIPanel title="Envelope" value={formatNumber(latestStockMetrics.ENVELOPE?.Saldo, 3)} comparison={`Est. Ant: ${formatNumber(latestStockMetrics.ENVELOPE?.['Estoque Dia Ant.'], 3)} | Emb: ${formatNumber(latestStockMetrics.ENVELOPE?.Embossing, 3)}`}/>
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
                                  title="Resumo Saldo (Últ. Dia)"
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