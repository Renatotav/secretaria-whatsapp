const REQUEST_TIMEOUT_MS = 10_000;

async function evolutionFetch(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(`Evolution API não respondeu em ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw new Error(`Falha ao conectar na Evolution API (${url}): ${err instanceof Error ? err.message : err}`);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Evolution API error ${response.status}: ${body}`);
  }
  return response;
}

export async function sendWhatsAppMessage(
  evolutionUrl: string,
  evolutionApiKey: string,
  instanceId: string,
  phone: string,
  text: string
): Promise<void> {
  const url = `${evolutionUrl}/message/sendText/${instanceId}`;
  await evolutionFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: evolutionApiKey,
    },
    body: JSON.stringify({
      number: phone,
      text,
    }),
  });
}

export async function sendPresence(
  evolutionUrl: string,
  evolutionApiKey: string,
  instanceId: string,
  phone: string,
  presence: "composing" | "recording" | "paused",
  delayMs: number
): Promise<void> {
  const url = `${evolutionUrl}/chat/sendPresence/${instanceId}`;
  await evolutionFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: evolutionApiKey,
    },
    body: JSON.stringify({
      number: phone,
      delay: delayMs,
      presence,
    }),
  });
}

/**
 * Simula digitação por um tempo proporcional ao tamanho do texto (com teto)
 * antes de enviar a mensagem. Falha ao simular presence não deve bloquear o envio.
 */
export async function sendTextWithTyping(
  evolutionUrl: string,
  evolutionApiKey: string,
  instanceId: string,
  phone: string,
  text: string,
  typingMsPerChar: number,
  typingMaxSeconds: number
): Promise<void> {
  const durationMs = Math.min(text.length * typingMsPerChar, typingMaxSeconds * 1000);

  if (durationMs > 0) {
    try {
      await sendPresence(evolutionUrl, evolutionApiKey, instanceId, phone, "composing", durationMs);
    } catch (err) {
      console.error("[evolution] falha ao simular digitação", err);
    }
    await new Promise((resolve) => setTimeout(resolve, durationMs));
  }

  await sendWhatsAppMessage(evolutionUrl, evolutionApiKey, instanceId, phone, text);
}

export interface MediaBase64Result {
  mediaType: string;
  mimetype: string;
  fileName: string;
  base64: string;
}

export async function getBase64FromMediaMessage(
  evolutionUrl: string,
  evolutionApiKey: string,
  instanceId: string,
  messageId: string
): Promise<MediaBase64Result> {
  const url = `${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceId}`;
  const response = await evolutionFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: evolutionApiKey,
    },
    body: JSON.stringify({
      message: { key: { id: messageId } },
      convertToMp4: false,
    }),
  });
  return response.json();
}

export interface EvolutionInstance {
  name: string;
  connected: boolean;
  raw: Record<string, unknown>;
}

export async function fetchInstances(
  evolutionUrl: string,
  evolutionApiKey: string
): Promise<EvolutionInstance[]> {
  const url = `${evolutionUrl}/instance/fetchInstances`;
  const response = await evolutionFetch(url, {
    headers: { apikey: evolutionApiKey },
  });
  const data = await response.json();
  const list: Record<string, unknown>[] = Array.isArray(data) ? data : [];

  return list.map((item) => {
    const instance = (item.instance as Record<string, unknown>) ?? item;
    const name = (instance.instanceName as string) ?? (instance.name as string) ?? "";
    const state =
      (instance.connectionStatus as string) ??
      (instance.state as string) ??
      (instance.status as string) ??
      "";
    return { name, connected: state === "open", raw: item };
  });
}

export async function setInstanceWebhook(
  evolutionUrl: string,
  evolutionApiKey: string,
  instanceId: string,
  webhookUrl: string
): Promise<void> {
  const url = `${evolutionUrl}/webhook/set/${instanceId}`;
  await evolutionFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: evolutionApiKey,
    },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: true,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
}
