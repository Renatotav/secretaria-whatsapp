export async function register() {
  // Executa o agendador apenas no ambiente Node.js (não no Edge)
  // SCHEDULER_OFF=1: prévia local com dados reais não manda nada no WhatsApp.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SCHEDULER_OFF !== "1") {
    console.log("[instrumentation] Iniciando scheduler...");
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
