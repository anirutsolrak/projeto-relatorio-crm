import React from 'react';
import TruncatedTextWithPopover from './TruncatedTextWithPopover';

function Header({ user, onLogout, onUploadClick, isUploaderOpen }) {
    const reportError = (error) => console.error("Header Error:", error);
    try {
        const canUpload = user && user.role !== 'guest';

        return (
            <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4" data-name="dashboard-header">
                <h1 className="text-2xl font-semibold text-gray-800" data-name="header-title">
                    Dashboard de Relatórios
                </h1>

                <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                    {canUpload && (
                        <button
                            onClick={onUploadClick}
                            className={`btn ${isUploaderOpen ? 'btn-secondary' : 'btn-primary'} btn-icon w-full sm:w-auto`}
                            data-name="upload-button"
                        >
                            <i className={`fas ${isUploaderOpen ? 'fa-times' : 'fa-upload'}`}></i>
                            <span>{isUploaderOpen ? 'Fechar Upload' : 'Carregar Relatório'}</span>
                        </button>
                    )}

                    {user && (
                        <div className="flex items-center gap-2 border-t pt-4 md:border-t-0 md:pt-0 md:border-l md:pl-4 mt-4 md:mt-0 w-full sm:w-auto justify-center">
                             <TruncatedTextWithPopover
                                className="text-sm text-gray-600"
                                title={user.email}
                             >
                                 {user.email === 'guest@example.com' ? 'Convidado' : user.email}
                            </TruncatedTextWithPopover>
                            <button
                                onClick={onLogout}
                                className="btn btn-secondary btn-icon"
                                data-name="logout-button"
                                title="Sair"
                            >
                                <i className="fas fa-sign-out-alt"></i>
                            </button>
                        </div>
                    )}
                </div>
            </header>
        );
    } catch (error) {
        console.error('Header component error:', error);
        reportError(error);
        return <header>Erro no cabeçalho.</header>;
    }
}

export default Header;