export const PHONE_VERIFICATION_ENABLED = false;

/**
 * PHONE-1 — login por número de telefone. O backend (POST /auth/login) só aceita E-MAIL, então a aba "Telefone Internacional" do
 * login nunca funcionou (sempre "E-mail inválido"). Escondida enquanto o backend não suportar; o código da aba fica preservado.
 */
export const PHONE_LOGIN_ENABLED = false;
