/**
 * Interruptor do Nusali AI (assistente) na interface PÚBLICA: botão/chat flutuante, divulgação no rodapé e card da Central de Ajuda.
 * Fica DESLIGADO até o assistente ser integrado aos dados reais do Mercado Nusali. O código (AIAssistantModal etc.) está preservado:
 * para reativar tudo de uma vez, troque para true.
 */
export const SHOW_NUSALI_AI = false;

/**
 * Interruptor do "Câmbio do Dia" (botão do menu do Header, desktop e mobile, que abre o conversor de moedas) na interface PÚBLICA.
 * Fica DESLIGADO até a cotação estar alimentada por fonte de dados oficial/confiável. Só oculta as entradas: o conversor
 * (CurrencyConverterModal), o CurrencyService e a API de câmbio seguem intactos (os preços exibidos continuam usando-os).
 * Para reativar, troque para true.
 */
export const SHOW_CAMBIO_DO_DIA = false;
