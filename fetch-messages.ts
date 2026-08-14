import { prisma } from './src/lib/prisma';

async function main() {
  const config = await prisma.agentConfig.findFirst();
  if (!config) {
    console.error("No config found");
    return;
  }
  console.log("Config loaded. Owner phone:", config.ownerPhone);
  console.log("Url:", config.evolutionUrl);
  console.log("Instance:", config.instanceId);
  console.log("Key:", config.evolutionApiKey);
  
  const jid = `${config.ownerPhone}@s.whatsapp.net`;
  
  // Fetch messages from Evolution API
  const url = `${config.evolutionUrl}/chat/findMessages/${config.instanceId}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': config.evolutionApiKey
    },
    body: JSON.stringify({
      where: {
        key: {
          remoteJid: jid
        }
      }
    })
  });
  
  if (!response.ok) {
    console.error("Error fetching messages:", await response.text());
    return;
  }
  
  const data = await response.json();
  console.log(`Found ${data.messages?.length || data.length || 0} messages.`);
  
  const fs = require('fs');
  fs.writeFileSync('messages.json', JSON.stringify(data, null, 2));
  console.log("Saved messages to messages.json");
}

main().catch(console.error);
