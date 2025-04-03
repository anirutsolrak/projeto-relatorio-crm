import React, { useRef, useEffect } from 'react';
import Chart from 'chart.js/auto';

function ChartComponent({ title, type, data, options, onBarClick }) {
    const reportError = (error) => console.error("ChartComponent Error:", error);
    try {
        const chartRef = useRef(null);
        const chartInstance = useRef(null);

        useEffect(() => {
            if (!chartRef.current) return;
            if (typeof Chart === 'undefined') {
                console.error("Chart library is not loaded.");
                return;
            }

            const ctx = chartRef.current.getContext('2d');

            if (chartInstance.current) {
                chartInstance.current.destroy();
            }

            const defaultLabelCallback = function(context) {
                let label = context.dataset.label || '';
                if (label) { label += ': '; }
                if (context.parsed?.y !== null && context.parsed?.y !== undefined) {
                    label += context.parsed.y.toLocaleString('pt-BR');
                } else if (context.parsed?.x !== null && context.parsed?.x !== undefined && options?.indexAxis === 'y'){
                    label += context.parsed.x.toLocaleString('pt-BR'); // For horizontal bar
                }
                return label;
            };

            const horizontalBarLabelCallback = function(context) {
                let label = context.dataset.label || '';
                if (label) { label += ': '; }
                if (context.parsed?.x !== null && context.parsed?.x !== undefined) {
                    label += context.parsed.x.toLocaleString('pt-BR');
                }
                return label;
            };

            const config = {
                type,
                data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        tooltip: {
                            callbacks: {
                                label: defaultLabelCallback
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                autoSkip: true,
                                maxRotation: 0,
                                padding: 5,
                            }
                        },
                        y: {
                             beginAtZero: true,
                            ticks: {
                                autoSkip: true,
                                padding: 5,
                            }
                        }
                    },
                    onClick: (event, elements) => {
                        if (elements.length > 0 && onBarClick) {
                            const element = elements[0];
                            const index = element.index;
                            const label = data.labels ? data.labels[index] : index;
                            const value = data.datasets[element.datasetIndex]?.data[index];
                            onBarClick(label, value, element.datasetIndex);
                        }
                    },
                    ...options
                }
            };

             if (type === 'bar' && config.options?.indexAxis === 'y') {
                 if (config.options.plugins?.tooltip?.callbacks) {
                      config.options.plugins.tooltip.callbacks.label = horizontalBarLabelCallback;
                 } else {
                      config.options.plugins = config.options.plugins || {};
                      config.options.plugins.tooltip = config.options.plugins.tooltip || {};
                      config.options.plugins.tooltip.callbacks = { label: horizontalBarLabelCallback };
                 }
                 // Ensure Y scale is treated as category for labels and X as value
                 config.options.scales = config.options.scales || {};
                 config.options.scales.y = { ...config.options.scales.y, type: 'category' };
                 config.options.scales.x = { ...config.options.scales.x, type: 'linear', beginAtZero: true };
             }

            chartInstance.current = new Chart(ctx, config);

            return () => {
                if (chartInstance.current) {
                    chartInstance.current.destroy();
                    chartInstance.current = null;
                }
            };
        }, [data, options, onBarClick, type]);

        return (
            React.createElement("div", { className: "chart-card", "data-name": "chart-component" },
                title && React.createElement("h3", { className: "chart-title", "data-name": "chart-title" }, title),
                React.createElement("div", { className: "chart-container" },
                    React.createElement("canvas", { ref: chartRef, "data-name": "chart-canvas" })
                )
            )
        );
    } catch (error) {
        console.error('ChartComponent error:', error);
        reportError(error);
        return React.createElement("div", { className: "chart-card error" }, "Erro ao renderizar o gráfico.");
    }
}

export default ChartComponent;