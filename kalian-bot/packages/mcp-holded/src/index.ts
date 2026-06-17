// MCP Server para Holded ERP
// Stub — se implementará en Fase 1
//
// Tools expuestos:
// - holded_create_contact: crear contacto (cliente/proveedor)
// - holded_create_invoice: crear factura borrador
// - holded_list_invoices: listar facturas con filtros
// - holded_create_expense: registrar gasto
// - holded_get_accounts: consultar plan de cuentas

export interface HoldedContact {
  name: string;
  nif?: string;
  email?: string;
  phone?: string;
  type: 'client' | 'supplier';
}

export interface HoldedInvoice {
  contactId: string;
  description: string;
  items: Array<{
    name: string;
    units: number;
    subtotal: number;
    tax: number;
  }>;
}

console.log('MCP Server mcp-holded: stub cargado');
