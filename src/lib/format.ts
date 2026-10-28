// Formatos do dono (pt-BR). Um lugar só: antes cada arquivo tinha sua cópia.

/** R$ 1.234,56 (Intl, com espaço não quebrável; negativo como -R$ 5,00). Painel e respostas novas. */
export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** R$ 1.234,56 com espaço comum (negativo como R$ -5,00): o formato histórico das mensagens do WhatsApp e do gráfico. */
export const brlMsg = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
