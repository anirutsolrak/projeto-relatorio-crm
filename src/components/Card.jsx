import React from 'react';

function Card({ title, children, onClick, className = '' }) {
    const reportError = (error) => console.error("Card Error:", error);
    try {
        return (
            <div
                className={`card bg-white rounded-lg p-6 shadow-md ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''} ${className}`}
                onClick={onClick}
                data-name={`card-${title?.toLowerCase().replace(/\s+/g, '-')}`}
                role={onClick ? 'button' : undefined}
                tabIndex={onClick ? 0 : undefined}
                onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                    {onClick && (
                        <span
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                            data-name="card-action-button"
                            aria-hidden="true" // Hide from screen readers, main div is the button
                        >
                            Ver Detalhes <i className="fas fa-chevron-right ml-1"></i>
                        </span>
                    )}
                </div>
                {children}
            </div>
        );
    } catch (error) {
        console.error('Card component error:', error);
        reportError(error);
        return <div className="card error">Erro no card.</div>;
    }
}

export default Card;