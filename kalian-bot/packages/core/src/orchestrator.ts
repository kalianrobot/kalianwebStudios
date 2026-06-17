import { AGENTS, SKILLS } from '@kalian-bot/shared';
import type { AgentDefinition, ConversationMessage } from '@kalian-bot/shared';

export interface OrchestratorResult {
  agentId: string;
  response: string;
  pendingConfirmation?: {
    skillId: string;
    summary: string;
  };
}

const ORCHESTRATOR_SYSTEM_PROMPT = `Eres el orquestador de KalianBot, un asistente para gestión de alquileres turísticos.

Tu trabajo es:
1. Entender la intención del usuario
2. Seleccionar el agente especializado correcto
3. Delegar la tarea al agente

Agentes disponibles:
${Object.values(AGENTS).map(a => `- ${a.id}: ${a.name} — skills: ${a.skills.join(', ')}`).join('\n')}

Responde SIEMPRE con un JSON:
{ "agent": "<agent_id>", "task": "<descripción de la tarea para el agente>" }

Si la petición no encaja en ningún agente, responde con:
{ "agent": null, "response": "<respuesta directa al usuario>" }`;

export async function handleMessage(
  text: string,
  _history: ConversationMessage[],
): Promise<OrchestratorResult> {
  // TODO: Llamar a Claude API con ORCHESTRATOR_SYSTEM_PROMPT
  // TODO: Parsear respuesta JSON → obtener agent_id
  // TODO: Si agent_id → delegar a executeAgent()
  // TODO: Si null → respuesta directa

  void ORCHESTRATOR_SYSTEM_PROMPT;
  void text;

  return {
    agentId: 'contable',
    response: 'Stub: orquestador no implementado aún',
  };
}

export async function executeAgent(
  agent: AgentDefinition,
  task: string,
  _history: ConversationMessage[],
): Promise<OrchestratorResult> {
  // TODO: Llamar a Claude API con agent.systemPrompt + tools de agent.skills
  // TODO: Si el skill requiere confirmación → devolver pendingConfirmation
  // TODO: Si no → ejecutar y devolver resultado

  const availableSkills = agent.skills
    .map(sid => SKILLS[sid])
    .filter(Boolean);

  void availableSkills;
  void task;

  return {
    agentId: agent.id,
    response: `Stub: agente ${agent.name} no implementado aún`,
  };
}
