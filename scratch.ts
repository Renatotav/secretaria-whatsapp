import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const config = await prisma.agentConfig.findFirst();
  if (!config) {
    console.log("no config");
    return;
  }
  const jid = "558582392513@s.whatsapp.net";
  const url = `${config.evolutionUrl}/chat/findContacts/${config.instanceId}`;
  
  // Test POST with where
  const res1 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.evolutionApiKey },
    body: JSON.stringify({ where: { id: jid } })
  });
  console.log("POST /chat/findContacts (where id):", await res1.json());

  // Test POST with where remoteJid
  const res2 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.evolutionApiKey },
    body: JSON.stringify({ where: { remoteJid: jid } })
  });
  console.log("POST /chat/findContacts (where remoteJid):", await res2.json());

  // Test GET (which usually fetches all in some APIs)
  const res3 = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json", apikey: config.evolutionApiKey },
  });
  console.log("GET /chat/findContacts:", await res3.text());
}
run().finally(() => prisma.$disconnect());
