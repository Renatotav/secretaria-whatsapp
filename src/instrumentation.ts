export async function register() {
  // Executa o agendador apenas no ambiente Node.js (não no Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[instrumentation] Iniciando scheduler...");
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
