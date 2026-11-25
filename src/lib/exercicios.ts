// Biblioteca de exercícios (24/11/2026, aba Treino): nomes como se fala na academia no Brasil,
// grupo muscular, equipamento e apelidos (o que ele escreve no WhatsApp vira o nome certo).
// Lista nossa; exercícios criados por ele ficam na tabela ExercicioProprio.

export type Grupo = "Peito" | "Costas" | "Pernas" | "Glúteos" | "Ombros" | "Bíceps" | "Tríceps" | "Abdômen" | "Panturrilha" | "Antebraço" | "Cardio";
export type Equip = "barra" | "halter" | "máquina" | "polia" | "peso do corpo" | "kettlebell" | "elástico" | "anilha" | "esteira/bike";
export type Exercicio = { nome: string; grupo: Grupo; equip: Equip; apelidos?: string[]; tempo?: boolean; grande?: boolean };

/** grande = exercício de perna/costas pesado: sobe a carga de 5 em 5 kg (os outros, 2,5). */
export const EXERCICIOS: Exercicio[] = [
  // Peito
  { nome: "Supino reto com barra", grupo: "Peito", equip: "barra", apelidos: ["supino", "supino reto", "supino com barra"] },
  { nome: "Supino reto com halteres", grupo: "Peito", equip: "halter", apelidos: ["supino halter", "supino com halteres"] },
  { nome: "Supino inclinado com barra", grupo: "Peito", equip: "barra", apelidos: ["supino inclinado"] },
  { nome: "Supino inclinado com halteres", grupo: "Peito", equip: "halter", apelidos: ["supino inclinado halter"] },
  { nome: "Supino declinado", grupo: "Peito", equip: "barra" },
  { nome: "Supino na máquina", grupo: "Peito", equip: "máquina", apelidos: ["supino maquina", "chest press"] },
  { nome: "Crucifixo com halteres", grupo: "Peito", equip: "halter", apelidos: ["crucifixo"] },
  { nome: "Crucifixo na máquina (voador)", grupo: "Peito", equip: "máquina", apelidos: ["voador", "peck deck", "fly", "crucifixo maquina"] },
  { nome: "Cross-over na polia", grupo: "Peito", equip: "polia", apelidos: ["crossover", "cross over"] },
  { nome: "Flexão de braço", grupo: "Peito", equip: "peso do corpo", apelidos: ["flexao", "flexoes"] },
  { nome: "Mergulho nas paralelas", grupo: "Peito", equip: "peso do corpo", apelidos: ["paralelas", "mergulho"] },
  // Costas
  { nome: "Puxada frontal na polia", grupo: "Costas", equip: "polia", apelidos: ["puxada", "puxada frente", "puxada alta", "pulldown", "puxador"], grande: true },
  { nome: "Puxada com triângulo", grupo: "Costas", equip: "polia", apelidos: ["puxada triangulo"] },
  { nome: "Remada baixa na polia", grupo: "Costas", equip: "polia", apelidos: ["remada baixa", "remada sentada"], grande: true },
  { nome: "Remada curvada com barra", grupo: "Costas", equip: "barra", apelidos: ["remada curvada"], grande: true },
  { nome: "Remada unilateral com halter (serrote)", grupo: "Costas", equip: "halter", apelidos: ["serrote", "remada unilateral"] },
  { nome: "Remada na máquina", grupo: "Costas", equip: "máquina", apelidos: ["remada maquina", "remada articulada"], grande: true },
  { nome: "Barra fixa", grupo: "Costas", equip: "peso do corpo", apelidos: ["barra", "pull up", "pullup"] },
  { nome: "Levantamento terra", grupo: "Costas", equip: "barra", apelidos: ["terra", "deadlift"], grande: true },
  { nome: "Pulldown com braço estendido", grupo: "Costas", equip: "polia", apelidos: ["pullover polia"] },
  { nome: "Hiperextensão lombar", grupo: "Costas", equip: "peso do corpo", apelidos: ["lombar", "hiperextensao"] },
  // Pernas
  { nome: "Agachamento livre", grupo: "Pernas", equip: "barra", apelidos: ["agachamento", "agachamento com barra"], grande: true },
  { nome: "Agachamento no Smith", grupo: "Pernas", equip: "máquina", apelidos: ["agachamento smith", "smith"], grande: true },
  { nome: "Agachamento búlgaro", grupo: "Pernas", equip: "halter", apelidos: ["bulgaro"] },
  { nome: "Agachamento goblet", grupo: "Pernas", equip: "halter", apelidos: ["goblet"] },
  { nome: "Hack na máquina", grupo: "Pernas", equip: "máquina", apelidos: ["hack", "hack squat"], grande: true },
  { nome: "Leg press 45°", grupo: "Pernas", equip: "máquina", apelidos: ["leg press", "legpress", "leg 45", "leg press 45"], grande: true },
  { nome: "Leg press horizontal", grupo: "Pernas", equip: "máquina", apelidos: ["leg horizontal"], grande: true },
  { nome: "Cadeira extensora", grupo: "Pernas", equip: "máquina", apelidos: ["extensora"] },
  { nome: "Mesa flexora", grupo: "Pernas", equip: "máquina", apelidos: ["flexora", "flexora deitada"] },
  { nome: "Cadeira flexora", grupo: "Pernas", equip: "máquina", apelidos: ["flexora sentada"] },
  { nome: "Stiff", grupo: "Pernas", equip: "barra", apelidos: ["stiff com barra", "levantamento terra romeno", "terra romeno"], grande: true },
  { nome: "Afundo (passada)", grupo: "Pernas", equip: "halter", apelidos: ["afundo", "passada", "avanco"] },
  { nome: "Cadeira adutora", grupo: "Pernas", equip: "máquina", apelidos: ["adutora"] },
  // Glúteos
  { nome: "Elevação pélvica", grupo: "Glúteos", equip: "barra", apelidos: ["elevacao pelvica", "hip thrust"], grande: true },
  { nome: "Cadeira abdutora", grupo: "Glúteos", equip: "máquina", apelidos: ["abdutora"] },
  { nome: "Glúteo na polia (coice)", grupo: "Glúteos", equip: "polia", apelidos: ["gluteo polia", "coice gluteo", "gluteo"] },
  { nome: "Ponte de glúteo", grupo: "Glúteos", equip: "peso do corpo", apelidos: ["ponte"] },
  // Panturrilha
  { nome: "Panturrilha em pé", grupo: "Panturrilha", equip: "máquina", apelidos: ["panturrilha", "gemeos"] },
  { nome: "Panturrilha sentado", grupo: "Panturrilha", equip: "máquina", apelidos: ["panturrilha sentada", "soleo"] },
  { nome: "Panturrilha no leg press", grupo: "Panturrilha", equip: "máquina", apelidos: ["panturrilha leg"] },
  // Ombros
  { nome: "Desenvolvimento com halteres", grupo: "Ombros", equip: "halter", apelidos: ["desenvolvimento", "desenvolvimento halter"] },
  { nome: "Desenvolvimento com barra", grupo: "Ombros", equip: "barra", apelidos: ["desenvolvimento militar", "militar"] },
  { nome: "Desenvolvimento na máquina", grupo: "Ombros", equip: "máquina", apelidos: ["desenvolvimento maquina"] },
  { nome: "Elevação lateral", grupo: "Ombros", equip: "halter", apelidos: ["elevacao lateral", "lateral"] },
  { nome: "Elevação lateral na polia", grupo: "Ombros", equip: "polia", apelidos: ["lateral polia"] },
  { nome: "Elevação frontal", grupo: "Ombros", equip: "halter", apelidos: ["elevacao frontal", "frontal"] },
  { nome: "Crucifixo invertido", grupo: "Ombros", equip: "halter", apelidos: ["crucifixo inverso", "posterior", "voador invertido"] },
  { nome: "Face pull", grupo: "Ombros", equip: "polia", apelidos: ["facepull", "puxada para o rosto"] },
  { nome: "Encolhimento", grupo: "Ombros", equip: "halter", apelidos: ["encolhimento de ombros", "trapezio"] },
  // Bíceps
  { nome: "Rosca direta com barra", grupo: "Bíceps", equip: "barra", apelidos: ["rosca direta", "rosca", "rosca barra"] },
  { nome: "Rosca alternada com halteres", grupo: "Bíceps", equip: "halter", apelidos: ["rosca alternada"] },
  { nome: "Rosca martelo", grupo: "Bíceps", equip: "halter", apelidos: ["martelo"] },
  { nome: "Rosca Scott", grupo: "Bíceps", equip: "máquina", apelidos: ["scott", "rosca scott"] },
  { nome: "Rosca concentrada", grupo: "Bíceps", equip: "halter", apelidos: ["concentrada"] },
  { nome: "Rosca na polia", grupo: "Bíceps", equip: "polia", apelidos: ["rosca polia", "rosca cabo"] },
  // Tríceps
  { nome: "Tríceps na polia (corda)", grupo: "Tríceps", equip: "polia", apelidos: ["triceps corda", "corda"] },
  { nome: "Tríceps na polia (barra)", grupo: "Tríceps", equip: "polia", apelidos: ["triceps polia", "triceps pulley", "pulley", "triceps barra"] },
  { nome: "Tríceps testa", grupo: "Tríceps", equip: "barra", apelidos: ["testa", "triceps testa"] },
  { nome: "Tríceps francês", grupo: "Tríceps", equip: "halter", apelidos: ["frances", "triceps frances"] },
  { nome: "Tríceps no banco", grupo: "Tríceps", equip: "peso do corpo", apelidos: ["triceps banco", "mergulho no banco"] },
  { nome: "Tríceps coice", grupo: "Tríceps", equip: "halter", apelidos: ["coice", "triceps coice"] },
  // Abdômen
  { nome: "Abdominal (crunch)", grupo: "Abdômen", equip: "peso do corpo", apelidos: ["abdominal", "crunch", "abdominal supra"] },
  { nome: "Abdominal infra", grupo: "Abdômen", equip: "peso do corpo", apelidos: ["infra", "elevacao de pernas"] },
  { nome: "Abdominal na máquina", grupo: "Abdômen", equip: "máquina", apelidos: ["abdominal maquina"] },
  { nome: "Abdominal oblíquo", grupo: "Abdômen", equip: "peso do corpo", apelidos: ["obliquo", "bicicleta"] },
  { nome: "Prancha", grupo: "Abdômen", equip: "peso do corpo", apelidos: ["prancha frontal"], tempo: true },
  { nome: "Prancha lateral", grupo: "Abdômen", equip: "peso do corpo", tempo: true },
  // Antebraço
  { nome: "Rosca de punho", grupo: "Antebraço", equip: "barra", apelidos: ["punho", "rosca punho"] },
  { nome: "Caminhada do fazendeiro", grupo: "Antebraço", equip: "halter", apelidos: ["farmer walk", "fazendeiro"], tempo: true },
  // Cardio (na academia)
  { nome: "Esteira", grupo: "Cardio", equip: "esteira/bike", tempo: true },
  { nome: "Bicicleta ergométrica", grupo: "Cardio", equip: "esteira/bike", apelidos: ["bike", "bicicleta", "ergometrica"], tempo: true },
  { nome: "Elíptico", grupo: "Cardio", equip: "esteira/bike", apelidos: ["eliptico", "transport"], tempo: true },
  { nome: "Escada (simulador)", grupo: "Cardio", equip: "esteira/bike", apelidos: ["escada", "stair"], tempo: true },
  { nome: "Remo ergômetro", grupo: "Cardio", equip: "esteira/bike", apelidos: ["remo"], tempo: true },
  { nome: "Pular corda", grupo: "Cardio", equip: "peso do corpo", apelidos: ["corda de pular"], tempo: true },
];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[()°]/g, "").replace(/\s+/g, " ").trim();

/** Nome escrito por ele ("supino", "leg 45", "puxada alta") → exercício da biblioteca (ou null). */
export function acharExercicio(escrito: string, proprios: { nome: string; grupo: string; equipamento: string }[] = []): Exercicio | null {
  const f = fold(escrito);
  const todos: Exercicio[] = [...EXERCICIOS, ...proprios.map((p) => ({ nome: p.nome, grupo: p.grupo as Grupo, equip: (p.equipamento || "máquina") as Equip }))];
  return (
    todos.find((e) => fold(e.nome) === f) ??
    todos.find((e) => e.apelidos?.some((a) => fold(a) === f)) ??
    // "supino reto 40kg" já sem número: começa igual a um nome conhecido
    todos.find((e) => [e.nome, ...(e.apelidos ?? [])].some((a) => f.startsWith(fold(a) + " ") || fold(a).startsWith(f + " "))) ??
    null
  );
}

export const GRUPOS: Grupo[] = ["Peito", "Costas", "Pernas", "Glúteos", "Ombros", "Bíceps", "Tríceps", "Abdômen", "Panturrilha", "Antebraço", "Cardio"];
/** Séries por semana que costumam render para cada grupo (faixa usada no gráfico). */
export const SERIES_SEMANA: [number, number] = [10, 20];
