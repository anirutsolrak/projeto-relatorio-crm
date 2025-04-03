import React from 'react';

function RegionDetails({ region, data, onClose }) {
    const reportError = (error) => console.error("RegionDetails Error:", error);
    try {
        if (!region || !data || !data[region]) return null;

        const regionData = data[region];

        return (
            <div className="bg-white p-4 rounded-lg shadow-sm mt-4 border border-gray-200" data-name="region-details">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900 capitalize">{region}</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                        data-name="close-region-details-button"
                        aria-label="Fechar detalhes da região"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between py-2 border-b border-gray-200">
                        <span className="font-medium">Total</span>
                        <span>{regionData.total?.toLocaleString('pt-BR') || '-'}</span>
                    </div>
                    {(regionData.states || []).map((state, idx) => (
                        <div key={idx} className="flex justify-between py-2 border-b border-gray-100">
                            <span>Estado: {state.uf}</span>
                            <div className="flex items-center gap-4">
                                <span>{state.count?.toLocaleString('pt-BR') || '-'}</span>
                                <span className="text-gray-500">({state.percentage || 0}%)</span>
                            </div>
                        </div>
                    ))}
                    {(!regionData.states || regionData.states.length === 0) && (
                        <p className="text-gray-500 text-sm py-2">Nenhum detalhe por estado disponível.</p>
                    )}
                </div>
            </div>
        );
    } catch (error) {
        console.error('RegionDetails component error:', error);
        reportError(error);
        return <div className="error">Erro ao exibir detalhes da região.</div>;
    }
}

export default RegionDetails;