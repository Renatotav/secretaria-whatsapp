# 🧠 Dossiê de Implementação: O Cérebro Financeiro & Emocional
*Documento de contexto para futuras sessões de Inteligência Artificial.*

## 📌 Objetivo Geral
Transformar o bot do WhatsApp de um mero "registrador de dados" para uma **Consciência Financeira Ativa**, cruzando os hábitos de gastos do usuário com o seu estado emocional (Diário) e oferecendo intervenções inteligentes sem quebrar o layout existente. A regra de ouro foi: *"Em time que está ganhando não se mexe (preservar as planilhas core que já funcionam)"*.

---

## 🛠️ 1. O Roteador do WhatsApp (`message-handlers.ts`)

### A. Alertas Conversacionais de Orçamento
- **Como era:** O bot só registrava a despesa.
- **Como ficou:** Quando uma despesa é lançada, o sistema consulta a tabela `Budget` do mês. Se atingir **80% ou 100%** da categoria, ou se a compra for em uma **Categoria Sensível** (*Delivery, Ifood, Mercado, Bebida, Besteira*), o sistema aciona uma chamada rápida para a LLM (`generateResponse`).
- **Comportamento:** A IA não bloqueia a compra. Ela gera uma "bronca inteligente" de 1 a 2 linhas, focada em gerar consciência e reflexão no usuário, usando um tom direto e empático.

### B. Mapeamento de Humor nas Finanças
- Adicionada a integração onde todo novo lançamento financeiro herda automaticamente o **Humor** do dia salvo no `DiaryEntry`.
- Se o humor estiver `neutro` e a despesa for maior que R$ 100, o bot pergunta ativamente no WhatsApp: *"Como você estava se sentindo hoje? Isso me ajuda a mapear seus gastos emocionais"*.
- **Retroatividade:** Se o usuário relatar um humor ruim no Diário *depois* de ter gasto dinheiro no dia, o sistema dá um `updateMany` em todas as despesas daquele dia, trocando o humor delas de neutro para o humor atual.

### C. Remanejamento Automático de Imprevistos
- **O Motor:** Dentro do `case "diary"`, toda vez que o usuário desabafa, a LLM analisa o texto buscando por **"Imprevistos Financeiros"** (ex: batidas de carro, doença, furto).
- **Ação:** O LLM devolve um JSON estruturado. Se detectar a emergência, o bot responde na hora no WhatsApp: *"Poxa, vi que teve esse problema. Quer que eu proponha um remanejamento do seu limite de [Categoria Não Essencial] para cobrir esse buraco?"*

---

## 📊 2. Relatórios e Fechamentos Automáticos

### A. Relatório Semanal Emocional (`weekly-report.ts`)
- O script que gera o resumo da semana (enviado aos domingos às 20h) foi atualizado.
- **Cruzamento Emocional:** O prompt da IA agora obriga o sistema a analisar os picos de gastos da semana e tentar cruzá-los com o que foi escrito no "Diário da Semana", identificando se a ansiedade gerou gastos com besteiras.
- **O Diário de Arrependimento:** O código rastreia qual foi a pior compra "Não Essencial" da semana (maior valor fora de moradia/saúde). O relatório é finalizado com uma pergunta direta: *"PS: De cabeça fria, aquele gasto de R$ X com [Categoria] valeu a pena ou bateu arrependimento? Responda para eu salvar"*. A resposta do usuário alimenta o banco do Diário.

### B. O Fechamento Pessoal Diário (`summarizer.ts` e `daily-summary/route.ts`)
- O sistema de "Resumo Diário", que antes servia **apenas** para resumir grupos silenciados do WhatsApp, foi expandido.
- Criada a função `generatePersonalDailySummary` que puxa: Finanças do dia, Diário do dia e Agenda do dia.
- O resultado é salvo no banco de dados com um ID de grupo falso (`groupJid: "personal"`) e o nome de exibição **"📝 Meu Resumo Diário"**.

---

## 🖥️ 3. Adaptação do Painel Web (Dashboard)

### A. Layout Separado (`daily-summary/page.tsx`)
- O dropdown que antes exibia "Todos os Grupos" foi reestruturado usando `<optgroup>`.
- Agora a interface é dividida em dois mundos:
  1. **📌 Meus Resumos** (onde fica o Fechamento Pessoal Diário)
  2. **💬 Grupos do WhatsApp** (onde ficam os grupos lidos pelo bot)
- Isso manteve o design original intacto sem criar páginas novas que pudessem quebrar.

### B. Geração Manual Sob Demanda (O Fim das Telas Vazias)
- **Problema:** As telas de Resumo Diário e Relatório Semanal ficavam vazias até que o CRON rodasse no horário programado.
- **Solução:** Adicionados botões primários **"⚡ Gerar Resumo/Relatório Agora"** nas páginas `daily-summary/page.tsx` e `weekly-report/page.tsx`.
- Ao clicar, um fetch `POST` força a API a acionar a Inteligência Artificial imediatamente, ler o banco e carregar os gráficos/textos na tela em poucos segundos.

---

## 🤖 4. O Prompt Master do Sistema
O prompt personalizado do agente (`agentConfig`) foi atualizado para suportar a **"Consciência Financeira"** sem perder as regras antigas. A estrutura final salva contém:
1. Tom de Secretária Conselheira (Firme mas empática).
2. Regras estritas de Alertas Financeiros e Imprevistos.
3. Tratamento rigoroso de Categorias Financeiras fixas.
4. Regras condicionais do Redmine (Tickets).
5. Gatilhos de Urgência de Grupos baseados apenas em Menção Direta.
