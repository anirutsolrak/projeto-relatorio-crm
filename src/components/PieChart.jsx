
import React, { useRef, useEffect } from 'react';
import Chart from 'chart/auto';

function PieChart({ data, title, onClickSlice }) {
    const reportError = (error) => console.error("PieChart Error:", error);
    try {
        const chartRef = useRef(null);
        const chartInstance = useRef(null);

        useEffect(() => {
            if (chartRef.current) {
                if (typeof Chart === 'undefined') {
                     console.error("Chart library is not loaded globally.");
                     return;
                }
                const ctx = chartRef.current.getContext('2d');

                const getBackgroundColors = (labels = []) => {
                    const colorMap = {
                        'Entregue': '#10b981',
                        'Em Rota': '#3b82f6',
                        'Custódia': '#f59e0b',
                        'Devolução': '#ef4444',
                        'norte': '#6b7280',
                        'nordeste': '#64748b',
                        'sudeste': '#475569',
                        'sul': '#334155',
                        'centroOeste': '#1e293b',
                        'default': '#94a3b8'
                    };
                     return labels.map(label => colorMap[label] || colorMap['default']);
                };

                if (chartInstance.current) {
                    chartInstance.current.destroy();
                }

                chartInstance.current = new Chart(ctx, {
                    type: 'pie',
                    data: {
                        labels: data?.labels || [],
                        datasets: [{
                            data: data?.values || [],
                            backgroundColor: getBackgroundColors(data?.labels),
                            borderWidth: 1,
                            borderColor: '#fff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    padding: 20,
                                    usePointStyle: true,
                                    pointStyle: 'circle',
                                    font: {
                                        size: 12
                                    }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const datasetData = context.dataset?.data;
                                        if (!datasetData || !Array.isArray(datasetData)) {
                                            return context.label || '';
                                        }
                                        const label = context.label || '';
                                        const value = context.raw || 0;
                                        const total = datasetData.reduce((acc, val) => acc + (typeof val === 'number' ? val : 0), 0);
                                         const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                                        return `${label}: ${value.toLocaleString('pt-BR')} (${percentage}%)`;
                                    }
                                }
                            }
                        },
                        onClick: (event, elements) => {
                            if (elements.length > 0 && onClickSlice && data?.labels) {
                                const index = elements[0].index;
                                if (index >= 0 && index < data.labels.length) {
                                    onClickSlice(data.labels[index]);
                                }
                            }
                        }
                    }
                });
            }

            return () => {
                if (chartInstance.current) {
                    chartInstance.current.destroy();
                    chartInstance.current = null;
                }
            };
        }, [data, onClickSlice]);

        return (
            <div className="pie-chart-container" data-name="pie-chart-container">
                <h4 className="text-lg font-medium text-gray-700 mb-3">{title}</h4>
                <div className="pie-chart-wrapper">
                    <canvas ref={chartRef} data-name="pie-chart-canvas"></canvas>
                </div>
            </div>
        );
    } catch (error) {
        console.error('PieChart component error:', error);
        reportError(error);
        return <div className="pie-chart-container error">Erro ao carregar gráfico.</div>;
    }
}

export default PieChart;