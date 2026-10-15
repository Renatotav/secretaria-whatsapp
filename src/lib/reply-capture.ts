import { AsyncLocalStorage } from "async_hooks";

// Pedido feito por voz (skill da Alexa): as respostas que a secretária manda
// para o WhatsApp também ficam guardadas aqui, para a Alexa falar.
export const replyCapture = new AsyncLocalStorage<string[]>();
