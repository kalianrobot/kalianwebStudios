export type ConfirmationPolicy = 'always' | 'writes_only' | 'never';

export interface AgentDefinition {
  id: string;
  name: string;
  systemPrompt: string;
  skills: string[];
  mcpServers: string[];
  confirmationPolicy: ConfirmationPolicy;
}

export interface SkillDefinition {
  id: string;
  description: string;
  agents: string[];
  mcpServer: string | null;
  requiresConfirmation: boolean;
}

export interface AuditEntry {
  userId: string;
  agentId: string;
  skillId: string;
  action: string;
  inputSummary: string;
  outputSummary: string;
  success: boolean;
  error?: string;
  timestamp: Date;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCallRecord[];
}

export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
}

export interface Invoice {
  id: string;
  type: 'emitted' | 'received';
  source: 'voice' | 'scan' | 'icnea' | 'booking' | 'airbnb' | 'manual';
  clientId: string;
  description: string;
  baseAmount: number;
  taxType: 'iva_21' | 'iva_10' | 'iva_4' | 'exento';
  taxAmount: number;
  irpfRate: number | null;
  irpfAmount: number | null;
  total: number;
  status: 'draft' | 'posted' | 'paid' | 'overdue';
  holdedId: string | null;
  icneaId: string | null;
  pdfUrl: string | null;
  createdAt: Date;
  dueDate: Date | null;
}

export interface Client {
  id: string;
  name: string;
  nif: string | null;
  email: string | null;
  phone: string | null;
  holdedId: string | null;
  type: 'guest' | 'owner' | 'supplier';
}

export interface Property {
  id: string;
  name: string;
  icneaId: string;
  ownerId: string;
  address: string;
  channelIds: {
    bookingId?: string;
    airbnbId?: string;
  };
}

export interface Review {
  id: string;
  source: 'booking' | 'airbnb';
  propertyId: string;
  rating: number;
  text: string;
  reviewerName: string;
  date: Date;
  response: string | null;
  responseStatus: 'pending' | 'drafted' | 'sent';
}
