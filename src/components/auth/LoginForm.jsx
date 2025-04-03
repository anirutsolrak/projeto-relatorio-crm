import React, { useState } from 'react';
import getSupabaseClient from '../../utils/supabaseClient';

function LoginForm({ onSwitchToSignup, onSwitchToGuest }) {
    const reportError = (error) => console.error("LoginForm Error:", error);

    try {
        const [email, setEmail] = useState('');
        const [password, setPassword] = useState('');
        const [error, setError] = useState(null);
        const [loading, setLoading] = useState(false);
        const [debugInfo, setDebugInfo] = useState(null);
        const supabase = getSupabaseClient();

        const handleSubmit = async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            setDebugInfo(null);

            try {
                console.log("Attempting login with:", email);
                const { data, error: authError } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });

                console.log("Login response:", { data, authError });

                if (authError) {
                    let debugData = {
                        timestamp: new Date().toISOString(),
                        errorCode: authError.code,
                        status: authError.status,
                        message: authError.message,
                        emailUsed: email
                    };
                    setDebugInfo(debugData);
                    console.log("Login debug info:", debugData);
                    throw authError;
                }

                if (!data?.user) {
                    throw new Error("No user data returned from authentication");
                }

            } catch (err) {
                console.error("Login failed:", err);
                let userMessage = "Falha no login. Tente novamente.";

                if (err.message.includes("Invalid login credentials")) {
                    userMessage = "Email ou senha inválidos.";
                } else if (err.message.includes("Email not confirmed")) {
                    userMessage = "Seu email ainda não foi confirmado. Verifique sua caixa de entrada.";
                } else if (err.message.includes("Failed to fetch")) {
                    userMessage = "Problema de conexão. Verifique sua internet.";
                }

                setError(userMessage);
                reportError(err);
            } finally {
                setLoading(false);
            }
        };

        return (
            <div className="auth-card" data-name="login-form">
                <h2 className="auth-title">Login</h2>

                {error && (
                    <div className="error-message mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert" data-name="login-error">
                        <strong className="font-bold"><i className="fas fa-exclamation-circle mr-2"></i>Erro: </strong>
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                {debugInfo && (
                    <div className="debug-info mt-4 p-3 bg-gray-100 text-xs text-gray-700 rounded" data-name="debug-info">
                        <p><strong>Debug Info:</strong></p>
                        <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label className="input-label" htmlFor="login-email">Email</label>
                        <input
                            type="email"
                            id="login-email"
                            className="input-field"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            data-name="email-input"
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="login-password">Senha</label>
                        <input
                            type="password"
                            id="login-password"
                            className="input-field"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            data-name="password-input"
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary w-full mt-6"
                        disabled={loading}
                        data-name="login-button"
                    >
                        {loading ? (
                            <React.Fragment>
                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                Entrando...
                            </React.Fragment>
                        ) : (
                            'Entrar'
                        )}
                    </button>
                </form>

                <div className="auth-footer mt-6">
                    <p>
                        Não tem uma conta?{' '}
                        <span className="auth-link" onClick={onSwitchToSignup} data-name="signup-link">
                            Cadastre-se
                        </span>
                    </p>
                    <p className="mt-2">
                        Ou{' '}
                        <span className="auth-link" onClick={onSwitchToGuest} data-name="guest-link">
                            acesse como convidado
                        </span>
                    </p>
                </div>
            </div>
        );
    } catch (error) {
        console.error('LoginForm component error:', error);
        reportError(error);
        return <div className="auth-card error">Erro ao carregar formulário de login.</div>;
    }
}

export default LoginForm;