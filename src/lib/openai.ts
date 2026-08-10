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
 * Transcreve áudio (base64) usando Groq (whisper-large-v3) se houver chave
 * configurada, ou OpenAI (whisper-1) como alternativa. Sem nenhuma das duas
 * chaves configuradas, lança erro — quem chama deve tratar e logar.
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

  const apiKey = providerOpts.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Nenhuma chave configurada para transcrição de áudio (Groq ou OpenAI)");
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
