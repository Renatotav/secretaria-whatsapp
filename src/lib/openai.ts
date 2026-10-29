import OpenAI, { toFile } from "openai";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ProviderOptions {
  aiProvider?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  googleApiKey?: string;
  googleModel?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
}

/** Modelos que não têm provedor ZDR na OpenRouter (descoberto na 1ª chamada). */
const SEM_ZDR = new Set<string>();
/** Reserva quando o modelo configurado é aposentado ou some da OpenRouter. */
const MODELO_RESERVA = "google/gemini-3.1-flash-lite";
const MODELO_FORA = new Set<string>();

export async function generateResponse(
  messages: ChatMessage[],
  systemPrompt: string,
  temperature: number,
  maxTokens: number,
  providerOpts?: ProviderOptions
): Promise<{ content: string; tokens: number }> {
  const provider = providerOpts?.aiProvider ?? "openai";

  if (provider === "groq" && providerOpts?.groqApiKey) {
    const groq = new OpenAI({
      apiKey: providerOpts.groqApiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    const model = providerOpts.groqModel ?? "llama-3.3-70b-versatile";
    const response = await groq.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    });
    return {
      content: response.choices[0]?.message?.content ?? "",
      tokens: response.usage?.total_tokens ?? 0,
    };
  }

  if (provider === "google" && providerOpts?.googleApiKey) {
    const google = new OpenAI({
      apiKey: providerOpts.googleApiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
    const model = providerOpts.googleModel ?? "gemini-2.0-flash";
    const response = await google.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    });
    return {
      content: response.choices[0]?.message?.content ?? "",
      tokens: response.usage?.total_tokens ?? 0,
    };
  }

  if (provider === "openrouter" && providerOpts?.openrouterApiKey) {
    const openrouter = new OpenAI({
      apiKey: providerOpts.openrouterApiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    let model = providerOpts.openrouterModel ?? "openai/gpt-4o-mini";
    // Modelo aposentado/fora do ar (o Google está aposentando o gemini-2.5-flash-lite):
    // passa sozinho para o reserva, testado em 21/10/2026 com as mensagens dele (8/10, igual).
    if (MODELO_FORA.has(model)) model = MODELO_RESERVA;
    // Finanças e conversas dele: prefere provedor que não guarda (ZDR); se nenhum
    // estiver disponível agora, usa o normal para a secretária não parar.
    const pedir = (zdr: boolean) =>
      openrouter.chat.completions.create({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        ...(zdr ? { provider: { zdr: true, data_collection: "deny" } } : {}),
      } as Parameters<typeof openrouter.chat.completions.create>[0]) as Promise<OpenAI.Chat.Completions.ChatCompletion>;
    const response = await (SEM_ZDR.has(model) ? pedir(false) : pedir(true))
      .catch((err) => {
        // Modelo sem nenhum provedor ZDR (ex.: gemini-2.5-flash-lite, só no AI Studio): lembra e vai direto nas próximas.
        if (/data policy|zero data retention/i.test(String(err?.message))) SEM_ZDR.add(model);
        else console.warn("[ia] provedor ZDR falhou, indo pelo normal:", err instanceof Error ? err.message.slice(0, 120) : err);
        return pedir(false);
      })
      .catch(async (err) => {
        // O próprio modelo não existe mais (404/"not a valid model"/"no endpoints"): troca pelo reserva.
        if (model !== MODELO_RESERVA && /not a valid model|no endpoints found|model.*(not found|deprecated|retired|unavailable)|404/i.test(String(err?.message))) {
          console.error(`[ia] modelo ${model} fora do ar — usando ${MODELO_RESERVA}`);
          MODELO_FORA.add(model);
          model = MODELO_RESERVA;
          return pedir(!SEM_ZDR.has(model)).catch(() => pedir(false));
        }
        // 429 = o provedor limitou pedidos seguidos: espera um pouco e tenta mais uma vez (antes a resposta falhava).
        if (/\b429\b|rate.?limit/i.test(String(err?.message))) {
          await new Promise((r) => setTimeout(r, 2500));
          return pedir(!SEM_ZDR.has(model)).catch(() => pedir(false));
        }
        throw err;
      });
    return {
      content: response.choices[0]?.message?.content ?? "",
      tokens: response.usage?.total_tokens ?? 0,
    };
  }

  const apiKey = providerOpts?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  const openai = new OpenAI({ apiKey });
  const model = providerOpts?.openaiModel ?? "gpt-4o-mini";
  const response = await openai.chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  });
  return {
    content: response.choices[0]?.message?.content ?? "",
    tokens: response.usage?.total_tokens ?? 0,
  };
}

/**
 * Manda uma imagem (base64) pra um modelo com visão junto de um prompt de
 * sistema, e devolve o texto da resposta (pra ser parseado como JSON por
 * quem chama). Groq não entra aqui — os modelos de chat padrão dela não têm
 * visão. Prioridade: OpenRouter > Google > OpenAI.
 */
/**
 * Leitura de nota/fatura/print. Teste de 20/10/2026 com duas notas reais: o
 * DeepSeek V4.1 Flash acertou total e itens como o Gemini 2.5 Flash, ~5× mais
 * barato (os "flash-lite" erraram itens). O Gemini fica de reserva.
 */
export const VISION_MODEL = "deepseek/deepseek-v4.1-flash-1017";
// Reserva e releitura de nota longa: precisa ter provedor ZDR (o Gemini 2.5
// não tem — em 22/10/2026 a nota caiu nas duas reservas com "No endpoints
// found matching your data policy"). Gemini 3.5 Flash tem ZDR pelo Google.
export const VISION_FALLBACK = "google/gemini-3.5-flash";

export async function generateVisionResponse(
  base64: string,
  mimetype: string,
  systemPrompt: string,
  providerOpts: ProviderOptions,
  /** Modelo do OpenRouter para esta leitura (padrão: DeepSeek V4.1 Flash, com o Gemini de reserva). */
  openrouterModel = VISION_MODEL
): Promise<string> {
  const imageContent = {
    type: "image_url" as const,
    image_url: { url: `data:${mimetype};base64,${base64}` },
  };
  const messages = [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: "Aqui está a imagem:" },
        imageContent,
      ],
    },
  ];

  if (providerOpts.openrouterApiKey) {
    const openrouter = new OpenAI({
      apiKey: providerOpts.openrouterApiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    // Não reaproveita o modelo de chat geral (config.openrouterModel) — tarefas
    // de OCR/leitura de tabela densa em foto precisam de um modelo forte em
    // documento, independente do que está configurado pro resto do sistema.
    const pedir = async (model: string) => {
      const response = await openrouter.chat.completions.create({
        model,
        temperature: 0.1,
        max_tokens: 8192,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        // DeepSeek (modelo aberto): só provedores que não guardam nem treinam com os dados.
        // Só provedor que não guarda nem treina (ZDR); DeepSeek pelos americanos.
        provider: { zdr: true, data_collection: "deny", ...(model.startsWith("deepseek/") ? { order: ["deepinfra", "cloudflare"] } : {}) },
      } as Parameters<typeof openrouter.chat.completions.create>[0]);
      return (response as { choices: { message?: { content?: string | null } }[] }).choices[0]?.message?.content ?? "";
    };
    // Falhou ou veio vazio: tenta de novo com o Gemini (era o padrão antes).
    try {
      const texto = await pedir(openrouterModel);
      if (texto.trim() || openrouterModel === VISION_FALLBACK) return texto;
    } catch (err) {
      if (openrouterModel === VISION_FALLBACK) throw err;
      console.warn(`[visão] ${openrouterModel} falhou, indo para ${VISION_FALLBACK}:`, err instanceof Error ? err.message : err);
    }
    return pedir(VISION_FALLBACK);
  }

  if (providerOpts.googleApiKey) {
    const google = new OpenAI({
      apiKey: providerOpts.googleApiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
    const response = await google.chat.completions.create({
      model: "gemini-2.0-flash",
      temperature: 0.1,
      max_tokens: 8192,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    });
    return response.choices[0]?.message?.content ?? "";
  }

  const apiKey = providerOpts.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Nenhuma chave configurada com suporte a visão (OpenRouter, Google ou OpenAI)");
  }
  const openai = new OpenAI({ apiKey });
  // gpt-4o completo, não o -mini configurado pro chat geral — leitura de
  // tabela densa precisa da versão forte.
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.1,
    max_tokens: 8192,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  });
  return response.choices[0]?.message?.content ?? "";
}

/**
 * Transcreve áudio (base64). Ordem: Groq (whisper-large-v3) > OpenAI
 * (whisper-1, só se a chave for mesmo da OpenAI — chave "sk-or-" é do
 * OpenRouter colada no campo errado) > OpenRouter. O OpenRouter não tem
 * endpoint de transcrição: o áudio vai como "input_audio" para um modelo que
 * escuta (Gemini), pedindo só a transcrição. Sem nenhuma chave, lança erro.
 */
export async function transcribeAudio(
  base64: string,
  format: string,
  providerOpts: ProviderOptions
): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const filename = `audio.${format || "ogg"}`;

  if (providerOpts.groqApiKey) {
    const groq = new OpenAI({
      apiKey: providerOpts.groqApiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    const file = await toFile(buffer, filename);
    const result = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      language: "pt",
    });
    return result.text ?? "";
  }

  const apiKey = providerOpts.openaiApiKey || process.env.OPENAI_API_KEY || "";
  if (apiKey && !apiKey.startsWith("sk-or-")) {
    const openai = new OpenAI({ apiKey });
    const file = await toFile(buffer, filename);
    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "pt",
    });
    return result.text ?? "";
  }

  const openrouterKey = providerOpts.openrouterApiKey || (apiKey.startsWith("sk-or-") ? apiKey : "");
  if (openrouterKey) {
    const openrouter = new OpenAI({
      apiKey: openrouterKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    const response = await openrouter.chat.completions.create({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcreva este áudio em português do Brasil, palavra por palavra. Responda APENAS com o texto falado, sem comentários, aspas ou explicações.",
            },
            // input_audio: formato aceito pelo OpenRouter para modelos que escutam áudio.
            { type: "input_audio", input_audio: { data: base64, format: (format || "ogg") as "wav" | "mp3" } },
          ],
        },
      ],
    });
    return (response.choices[0]?.message?.content ?? "").trim();
  }

  throw new Error("Nenhuma chave configurada para transcrição de áudio (Groq, OpenAI ou OpenRouter)");
}
