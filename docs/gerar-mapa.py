"""Gera docs/arquitetura.canvas — o mapa da secretária no formato JSON Canvas
(abre no Obsidian: arraste o arquivo para dentro de um cofre).

Formato (jsoncanvas.org): {"nodes": [...], "edges": [...]}
  nó:      {"id", "type": "text"|"group", "x", "y", "width", "height", "text"/"label", "color"}
  ligação: {"id", "fromNode", "toNode", "fromSide", "toSide", "label"}
  cores:   "1" vermelho · "2" laranja · "3" amarelo · "4" verde · "5" ciano · "6" roxo

Sem segredo, endereço ou dado pessoal: o repositório é público.
Rodar: python3 docs/gerar-mapa.py
"""
import json
import os

nodes, edges = [], []


def grupo(id_, label, x, y, w, h, cor):
    nodes.append({"id": id_, "type": "group", "x": x, "y": y, "width": w, "height": h, "label": label, "color": cor})


def caixa(id_, texto, x, y, w=300, h=120, cor=None):
    n = {"id": id_, "type": "text", "x": x, "y": y, "width": w, "height": h, "text": texto}
    if cor:
        n["color"] = cor
    nodes.append(n)


def liga(de, para, rotulo="", lado_de="right", lado_para="left"):
    edges.append({"id": f"{de}-{para}", "fromNode": de, "toNode": para, "fromSide": lado_de, "toSide": lado_para, "label": rotulo})


# ── Coluna 1: por onde as coisas entram ─────────────────────────────────────
grupo("g-entrada", "📥 Entradas", -40, -40, 380, 1180, "5")
caixa("whats", "## 📱 WhatsApp\nVocê manda texto, áudio, foto de nota, print de fatura, vídeo do painel da scooter.", 0, 0, cor="5")
caixa("evo", "## Evolution API\nPonte do WhatsApp. Avisa a secretária a cada mensagem (webhook com chave).", 0, 180)
caixa("ext", "## 🧩 Extensão Central do Atendente\nAssyst, WhatsApp Web, Redmine.\ncontent · corretor · atalhos · crm · atualizar · background · popup", 0, 360, h=150, cor="6")
caixa("escala", "## 🔄 Escala (sistema da equipe)\nCópia automática às 11h e 16h: status, Redmine, fila, última ação.", 0, 570)
caixa("planilha", "## 📊 Planilha (Excel/SharePoint)\nImportada pelo popup: tipo, resolução, STATUS, abertura do Redmine.", 0, 750)
caixa("alexa-in", "## 🗣️ Alexa (skill particular, em teste)\n\"Alexa, pede pra minha secretária…\"", 0, 930, h=100)

# ── Coluna 2: o servidor ───────────────────────────────────────────────────
grupo("g-servidor", "🖥️ Secretária (Next.js 16 + Prisma, EasyPanel)", 440, -40, 760, 1180, "4")
caixa("webhook", "## /api/webhook\nRecebe do WhatsApp, junta mensagens seguidas (debounce) e escolhe o caminho.", 480, 0)
caixa("handlers", "## message-handlers\nFinanceiro, nota fiscal, fatura, agenda, diário, scooter, Alexa, comandos do trabalho, alertas.", 480, 180, h=140)
caixa("router", "## personal-router\nA IA classifica a mensagem (gasto, agenda, diário, simulação…).", 480, 380)
caixa("workapi", "## /api/work/ext/*\nChave da extensão. lookup · ai · contact · snippets · sync · ping.", 820, 360, w=340, h=140, cor="6")
caixa("workai", "## work-ai (skills)\nRedmine, resumo, registro de conversa, corretores, melhorar escrita.\nTrava de processos em código (cnj-check).", 820, 540, w=340, h=150, cor="6")
caixa("privacy", "## work-privacy (LGPD)\nCPF mascarado, telefone/e-mail fora; corretores usam ⟦1⟧ e restauram.", 820, 740, w=340, h=120, cor="1")
caixa("scheduler", "## ⏰ scheduler (a cada minuto)\nBriefing 8h · relatório de segunda · contas 9h · lembretes · alertas do trabalho · resumo da manhã na Alexa.", 480, 560, h=150, cor="3")
caixa("painel", "## 🖥️ Painel web\nAgenda, Financeiro, Diário, Trabalho (Produtividade clicável, Pergunte aos seus chamados).", 480, 760, h=130)
caixa("mcp", "## 🔌 /api/mcp/<chave>\nConector só leitura para o app do Claude: chamados, financeiro, agenda, scooter.", 480, 940, h=120, cor="6")
caixa("db", "## 🐘 PostgreSQL\nFinanceEntry · AgendaItem · WorkTicket · WorkContact · ScooterLog · AgentConfig…\nBackup diário 03:30 (14 dias).", 820, 920, w=340, h=150, cor="4")

# ── Coluna 3: inteligência e casa ──────────────────────────────────────────
grupo("g-ia", "🧠 IA (OpenRouter)", 1260, -40, 380, 520, "2")
caixa("fable", "## Claude Fable 5.1\nSkills pesadas: Redmine, resumo, melhorar escrita.", 1300, 0, cor="2")
caixa("sonnet", "## Claude Sonnet 5.5\nCorretores (rápido), classificação, perguntas sobre chamados.", 1300, 160)
caixa("gemini", "## Gemini (Flash/Pro)\nNotas fiscais, prints, vídeo da scooter, vídeos do YouTube.", 1300, 320)

grupo("g-casa", "🏠 Casa (Tailscale)", 1260, 540, 380, 600, "3")
caixa("firetv", "## 📺 Fire TV\nRoteador do Tailscale para a tomada (só ela).", 1300, 580, cor="3")
caixa("tapo", "## 🔌 Tomada Tapo\nVigia no servidor: início/fim da carga, liga/desliga pelo WhatsApp.", 1300, 740)
caixa("celular", "## 📱 Celular no Wi-Fi\nVigia do Tailscale: em casa ou fora → a Alexa fala ou guarda.", 1300, 900, h=110)
caixa("echo", "## 🔊 Echo Dot (Voice Monkey)\nFala carga pronta, lembretes, contas e o resumo das 6:50.", 1300, 1030, h=90)

# ── Ligações ──────────────────────────────────────────────────────────────
liga("whats", "evo", "mensagem", "bottom", "top")
liga("evo", "webhook", "webhook")
liga("webhook", "handlers", "", "bottom", "top")
liga("handlers", "router", "classificar", "bottom", "top")
liga("router", "sonnet", "IA")
liga("handlers", "gemini", "foto/vídeo")
liga("ext", "workapi", "Bearer")
liga("workapi", "workai", "skills", "bottom", "top")
liga("workai", "privacy", "antes da IA", "bottom", "top")
liga("workai", "fable", "Redmine")
liga("escala", "db", "11h/16h")
liga("planilha", "workapi", "importar")
liga("alexa-in", "handlers", "voz → texto")
liga("scheduler", "echo", "falar")
liga("scheduler", "whats", "avisos", "left", "right")
liga("tapo", "scheduler", "carga", "left", "right")
liga("firetv", "tapo", "", "bottom", "top")
liga("celular", "echo", "em casa?", "bottom", "top")
liga("handlers", "db", "grava")
liga("painel", "db", "lê/edita")
liga("mcp", "db", "só leitura")

destino = os.path.join(os.path.dirname(__file__), "arquitetura.canvas")
with open(destino, "w", encoding="utf-8") as f:
    json.dump({"nodes": nodes, "edges": edges}, f, ensure_ascii=False, indent=1)
print(f"{destino}: {len(nodes)} nós, {len(edges)} ligações")
