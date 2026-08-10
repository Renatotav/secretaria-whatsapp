interface BufferEntry<T> {
  texts: string[];
  meta: T;
  timer: ReturnType<typeof setTimeout>;
}

const buffers = new Map<string, BufferEntry<unknown>>();

/**
 * Agrupa mensagens quebradas do mesmo contato numa janela de tempo.
 * Cada nova mensagem reseta o timer; quando a janela fecha sem novas
 * mensagens, junta tudo e chama onFlush uma única vez.
 */
export function bufferMessage<T>(
  key: string,
  text: string,
  meta: T,
  debounceSeconds: number,
  onFlush: (joinedText: string, meta: T) => Promise<void>
): void {
  async function flush() {
    const current = buffers.get(key) as BufferEntry<T> | undefined;
    if (!current) return;
    buffers.delete(key);
    const joined = current.texts.join("\n");
    try {
      await onFlush(joined, current.meta);
    } catch (err) {
      console.error("[debounce] erro ao processar buffer", key, err);
    }
  }

  const existing = buffers.get(key) as BufferEntry<T> | undefined;
  if (existing) {
    clearTimeout(existing.timer);
    existing.texts.push(text);
    existing.meta = meta;
    existing.timer = setTimeout(() => void flush(), debounceSeconds * 1000);
    return;
  }

  const entry: BufferEntry<T> = {
    texts: [text],
    meta,
    timer: setTimeout(() => void flush(), debounceSeconds * 1000),
  };
  buffers.set(key, entry as BufferEntry<unknown>);
}
