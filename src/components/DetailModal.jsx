import React, { useState } from 'react';
import PieChart from './PieChart';
import RegionDetails from './RegionDetails';

function DetailModal({ isOpen, onClose, type }) {
    const reportError = (error) => console.error("DetailModal Error:", error);
    try {
        if (!isOpen) return null;

        const [selectedRegion, setSelectedRegion] = useState(null);

        const mockData = {
            logistica: {
                statusBreakdown: [
                    { status: 'Entregue', count: 650, percentage: 65 },
                    { status: 'Em Rota', count: 150, percentage: 15 },
                    { status: 'Custódia', count: 120, percentage: 12 },
                    { status: 'Devolução', count: 80, percentage: 8 }
                ],
                regionalDistribution: {
                    norte: {
                        total: 200,
                        states: [
                            { uf: 'AM', count: 80, percentage: 40 },
                            { uf: 'PA', count: 70, percentage: 35 },
                            { uf: 'RR', count: 50, percentage: 25 }
                        ]
                    },
                    nordeste: {
                        total: 300,
                        states: [
                            { uf: 'BA', count: 120, percentage: 40 },
                            { uf: 'PE', count: 90, percentage: 30 },
                            { uf: 'CE', count: 90, percentage: 30 }
                        ]
                    },
                    sudeste: {
                        total: 350,
                        states: [
                            { uf: 'SP', count: 200, percentage: 57 },
                            { uf: 'RJ', count: 100, percentage: 29 },
                            { uf: 'MG', count: 50, percentage: 14 }
                        ]
                    },
                    sul: {
                        total: 100,
                        states: [
                            { uf: 'PR', count: 50, percentage: 50 },
                            { uf: 'RS', count: 30, percentage: 30 },
                            { uf: 'SC', count: 20, percentage: 20 }
                        ]
                    },
                    centroOeste: {
                        total: 50,
                        states: [
                            { uf: 'GO', count: 30, percentage: 60 },
                            { uf: 'MT', count: 15, percentage: 30 },
                            { uf: 'DF', count: 5, percentage: 10 }
                        ]
                    }
                },
                totalEntregas: 1000,
                taxaSucesso: 65
            },
             digitacao: { total: 1000, digitado: 749, naoDigitado: 251 },
             seguros: { total: 1000, integrados: 580, naoIntegrados: 420, cedidos: 320, naoCedidos: 680 }
        };

        const statusChartData = {
            labels: mockData.logistica.statusBreakdown.map(item => item.status),
            values: mockData.logistica.statusBreakdown.map(item => item.count)
        };

        const regionChartData = {
            labels: Object.keys(mockData.logistica.regionalDistribution),
            values: Object.values(mockData.logistica.regionalDistribution).map(region => region.total)
        };

        const handleRegionClick = (regionLabel) => {
             const regionKey = Object.keys(mockData.logistica.regionalDistribution).find(key => key.toLowerCase() === regionLabel.toLowerCase());
             if(regionKey) setSelectedRegion(regionKey);
             else console.warn("Region not found for label:", regionLabel);
        };

        const handleCloseRegionDetails = () => {
            setSelectedRegion(null);
        };

        const renderContent = () => {
            if (type === 'logistica') {
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <PieChart
                                data={statusChartData}
                                title="Detalhamento por Status"
                                data-name="status-pie-chart"
                            />
                            <PieChart
                                data={regionChartData}
                                title="Distribuição Regional"
                                onClickSlice={handleRegionClick}
                                data-name="region-pie-chart"
                            />
                        </div>

                        {selectedRegion && (
                            <RegionDetails
                                region={selectedRegion}
                                data={mockData.logistica.regionalDistribution}
                                onClose={handleCloseRegionDetails}
                            />
                        )}

                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-3">Visão Geral</h3>
                            <div className="summary-grid">
                                <div className="summary-card">
                                    <h4>Total de Entregas</h4>
                                    <div className="value">{mockData.logistica.totalEntregas}</div>
                                </div>
                                <div className="summary-card">
                                    <h4>Taxa de Sucesso</h4>
                                    <div className="value text-green-600">{mockData.logistica.taxaSucesso}%</div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            } else if (type === 'digitacao') {
                return (
                    <div className="summary-grid">
                       <div className="summary-card"><h4>Total</h4><div className="value">{mockData.digitacao.total}</div></div>
                       <div className="summary-card"><h4>Digitado</h4><div className="value text-green-600">{mockData.digitacao.digitado}</div></div>
                       <div className="summary-card"><h4>Não Digitado</h4><div className="value text-red-600">{mockData.digitacao.naoDigitado}</div></div>
                    </div>
                );
            } else if (type === 'seguros') {
                 return (
                     <div className="summary-grid">
                         <div className="summary-card"><h4>Total</h4><div className="value">{mockData.seguros.total}</div></div>
                         <div className="summary-card"><h4>Integrados</h4><div className="value text-green-600">{mockData.seguros.integrados}</div></div>
                         <div className="summary-card"><h4>Não Integrados</h4><div className="value text-red-600">{mockData.seguros.naoIntegrados}</div></div>
                         <div className="summary-card"><h4>Cedidos</h4><div className="value text-blue-600">{mockData.seguros.cedidos}</div></div>
                         <div className="summary-card"><h4>Não Cedidos</h4><div className="value text-yellow-600">{mockData.seguros.naoCedidos}</div></div>
                     </div>
                 );
            }
            return <p>Detalhes para '{type}' não disponíveis.</p>;
        };

        const getTitle = (type) => {
            switch(type) {
                case 'logistica': return 'Logística';
                case 'digitacao': return 'Digitação';
                case 'seguros': return 'Seguros';
                default: return 'Detalhes';
            }
        };

        return (
            <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

                    <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">​</span>

                    <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full sm:p-6">
                        <div>
                            <div className="mt-3 text-center sm:mt-0 sm:text-left">
                                <h3 id="modal-title" className="text-lg leading-6 font-medium text-gray-900 mb-4">
                                    Detalhes - {getTitle(type)}
                                </h3>
                                <div className="mt-2">
                                    {renderContent()}
                                </div>
                            </div>
                        </div>
                        <div className="mt-5 sm:mt-6">
                            <button
                                type="button"
                                className="inline-flex justify-center w-full rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm"
                                onClick={onClose}
                                data-name="close-modal-button"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    } catch (error) {
        console.error('DetailModal component error:', error);
        reportError(error);
        return null;
    }
}

export default DetailModal;