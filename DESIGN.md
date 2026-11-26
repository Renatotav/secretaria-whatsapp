# DESIGN.md — Painel da Secretária

Regras visuais do painel web (Next.js). Valem para qualquer tela nova ou ajuste.
As skills de design (impeccable, taste-skill, web-design-guidelines) devem
seguir este arquivo: aqui é **refinamento**, não redesign.

## Princípios (aprendidos com o dono)

1. **Um design só.** Celular e computador usam o mesmo layout; no computador os
   cartões só ficam lado a lado. Nada de "versão mobile" separada.
2. **Celular primeiro.** É onde ele mais usa. Conferir em 390 px de largura antes
   de qualquer outra.
3. **Cartões, não tabelas largas.** Tabela de muitas colunas esconde descrição e
   valor no celular e quebra palavras. Lançamentos = cartão com descrição + valor
   no topo, detalhes embaixo, botões no rodapé.
4. **Um dado, um lugar.** Não repetir a mesma informação em dois selos (ex.:
   status e "resolvido" lado a lado). Detalhe secundário vai para a dica (`title`)
   ou para o cartão aberto.
5. **Vivo, com propósito** (mudou em 26/11/2026; antes era "quieto"; ele: "muito estático e feio"). Cor
   só para significado (status, urgência, categoria, grupo muscular); nada de gradiente nem brilho. O
   movimento conta uma coisa, uma vez, ao abrir: barra que **enche** até o valor, número que **conta**
   até o valor, linha de gráfico que **se desenha**, item feito que **acende**, cartão que **surge**
   (classes `.enche`, `.conta` via `useConta`, `.traca`, `.acende`, `.surge` no `globals.css`).
   Nada piscando em loop; urgência pode pulsar. Sempre respeitar `prefers-reduced-motion` (tudo
   aparece pronto).
   gradiente, brilho ou animação decorativa; animação só para chamar atenção a
   algo vencido/urgente, e respeitando `prefers-reduced-motion`.
6. **Português simples.** Rótulos curtos, verbos no imperativo ("Salvar",
   "Atualizar"), emoji moderado como ícone. O dono não é técnico.

## Tokens (`src/app/globals.css`, `:root`)

Tema escuro (`color-scheme: dark`).

| Papel | Token | Valor |
|---|---|---|
| Fundo da página | `--bg` | `#0d0d1a` |
| Cartão | `--bg-card` | `#13131f` |
| Hover | `--bg-hover` | `#1a1a2e` |
| Borda | `--border` / `--border-light` | `#2a2a3d` / `#1e1e30` |
| Texto | `--text` / `--text-muted` / `--text-dim` | `#e8e8f0` / `#a3a3c2` / `#8b8bab` (clareados em 28/10 para ler no sol) |
| Destaque (marca) | `--accent` (+ `-dim`, `-border`, `-hover`) | `#7c6dff` |
| Sucesso / aviso / perigo | `--success` / `--warning` / `--danger` | `#4ade80` / `#fb923c` / `#f87171` |
| Urgência | `--urgency-critical/high/normal/low` | vermelho / laranja / verde-água / cinza |
| Chamados | `--ticket-open/resolved/escalated/pending` | laranja / verde / vermelho / lilás |

Use sempre os tokens; cor nova só se virar token.

## Layout

- Grades: `repeat(auto-fill, minmax(min(Xpx, 100%), 1fr))` — nunca estoura no celular.
- Página com grid: `gridTemplateColumns: minmax(0, 1fr)` (tabela não alarga a página).
- `.split` / `.split-list` / `.split-empty`: lista + detalhe que empilha no celular.
- Celular (≤ 760 px): abas embaixo — Hoje, Dinheiro, Trabalho, Scooter e ☰ Mais (o resto + sinal da Saúde). A barra lateral é só do computador.
- Topo de cada tela: um número que importa em destaque (resultado do mês, fila, folga), o resto abaixo.
  O número grande (44–60 px, `clamp`) com a unidade menor ao lado; abaixo, o caminho até a meta
  (barra grossa com marcos, ex.: degraus de 5 kg) e uma linha de contexto (ritmo, previsão).
- Cartão com `display: grid` leva `gridTemplateColumns: minmax(0, 1fr)`: sem isso um gráfico SVG
  (useWidth) estica o cartão e a página rola de lado no celular.
- Listas de itens com ação (exercícios, séries): lado a lado no computador
  (`repeat(auto-fill, minmax(min(360px, 100%), 1fr))`); campo numérico do tamanho do número, não da tela.
- Gráficos SVG medem a largura com `useWidth` (`src/lib/use-width.ts`).
- Personal (irmão, desde 27/11/2026): `usePapel()` (`src/lib/use-papel.ts`) diz quem está vendo. Para ele, o menu
  e as abas de baixo têm só 🏋️ Treino e 🍽️ Nutrição e peso. Nada de botão que leva a tela bloqueada, e nada de
  dica de WhatsApp (as dicas são do dono). Texto de apoio fala do Renato em terceira pessoa.
- Caixa "💬 Pergunte" no fim das abas que têm IA (Corpo, Treino, Ar, Scooter, Parcelas, Dinheiro): título
  com quem responde ("ao treinador") e três exemplos de pergunta em chips.
- Espaçamento interno com `.page-pad` ou estilo inline: o reset `* { padding: 0 }`
  do globals.css vence classes utilitárias do Tailwind (`p-4` não funciona).

## Letra

- IBM Plex Sans (carregada em `src/app/layout.tsx`), números tabulares. Título da tela: 22 px negrito, igual em todas (regra no `globals.css`).
- Campo de texto no celular (toque): 16 px no mínimo (regra `pointer: coarse` no `globals.css`). Abaixo disso o
  iPhone dá zoom ao tocar e a tela fica cortada dos lados (visto no iPhone do personal, 27/11).

## Formatos

- Dinheiro `R$ 1.234,56`, data `dd/mm/aaaa`, hora `14h30` — sempre pt-BR.
- Números alinhados com `font-variant-numeric: tabular-nums`.

## Conferência

Antes de entregar: print em 390 px e em 1280 px (container `pw-chrome`), um só
round de ajustes. Mudou o que o personal vê? Conferir também logado com a senha dele. Sem print do dono não dá por visto.
