import OpenAI from "openai";

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
