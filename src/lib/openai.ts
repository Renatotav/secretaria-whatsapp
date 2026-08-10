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
    const model = providerOpts.openrouterModel ?? "openai/gpt-4o-mini";
    const response = await openrouter.chat.completions.create({
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

  const apiKey = providerOpts?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  const openai = new OpenAI({ apiKey });
  const model = providerOpts?.openaiModel ?? "gpt-4.1-mini";
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
export async function generateVisionResponse(
  base64: string,
  mimetype: string,
  systemPrompt: string,
  providerOpts: ProviderOptions
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
    const response = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      temperature: 0.1,
      max_tokens: 8192,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    });
    return response.choices[0]?.message?.content ?? "";
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
 * Transcreve áudio (base64). Prioridade: Groq (whisper-large-v3) > OpenRouter
 * (openai/whisper-1) > OpenAI (whisper-1). Sem nenhuma chave configurada,
 * lança erro — quem chama deve tratar e logar.
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

  if (providerOpts.openrouterApiKey) {
    const openrouter = new OpenAI({
      apiKey: providerOpts.openrouterApiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    const file = await toFile(buffer, filename);
    const result = await openrouter.audio.transcriptions.create({
      file,
      model: "openai/whisper-1",
      language: "pt",
    });
    return result.text ?? "";
  }

  const apiKey = providerOpts.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Nenhuma chave configurada para transcrição de áudio (Groq, OpenRouter ou OpenAI)");
  }
  const openai = new OpenAI({ apiKey });
  const file = await toFile(buffer, filename);
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "pt",
  });
  return result.text ?? "";
}
