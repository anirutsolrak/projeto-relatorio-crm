import React, { useState } from 'react';

function GuestLogin({ onGuestLogin }) {
    const reportError = (error) => console.error("GuestLogin Error:", error);
    try {
        const [loading, setLoading] = useState(false);

        const handleGuestLogin = async () => {
            setLoading(true);

            try {
                const guestUser = {
                    id: 'guest',
                    email: 'guest@example.com',
                    role: 'guest'
                };

                onGuestLogin(guestUser, false); // Pass false for showLogin flag
            } catch (error) {
                console.error('Guest login error:', error);
                 reportError(error);
                 onGuestLogin(null, true); // Show login on error
            } finally {
                setLoading(false);
            }
        };

        return (
            <div className="auth-card" data-name="guest-login">
                <h2 className="auth-title">Acesso como Convidado</h2>
                <p className="text-gray-600 mb-6">Você poderá visualizar os dados, mas não poderá carregar relatórios.</p>

                <button
                    onClick={handleGuestLogin}
                    className="btn btn-secondary w-full"
                    disabled={loading}
                    data-name="guest-login-button"
                >
                    {loading ? (
                        <React.Fragment>
                            <i className="fas fa-spinner fa-spin"></i>
                            Carregando...
                        </React.Fragment>
                    ) : (
                        'Entrar como Convidado'
                    )}
                </button>

                <div className="auth-footer mt-6">
                    <p>
                        Para carregar relatórios,{' '}
                        <span className="auth-link" onClick={() => onGuestLogin(null, true)} data-name="login-link">
                            faça login
                        </span>
                    </p>
                </div>
            </div>
        );
    } catch (error) {
        console.error('GuestLogin component error:', error);
        reportError(error);
         // Try to show login as a fallback
        return (
             <div className="auth-card error">
                 Erro no componente de convidado.{' '}
                 <span className="auth-link" onClick={() => onGuestLogin(null, true)}>Tente fazer login.</span>
             </div>
         );
    }
}

export default GuestLogin;