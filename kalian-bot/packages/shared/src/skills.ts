import type { SkillDefinition } from './types.js';

export const SKILLS: Record<string, SkillDefinition> = {
  // --- Facturación ---
  crear_factura: {
    id: 'crear_factura',
    description: 'Crea factura borrador en Holded a partir de datos estructurados',
    agents: ['contable'],
    mcpServer: 'mcp-holded',
    requiresConfirmation: true,
  },
  calcular_impuestos: {
    id: 'calcular_impuestos',
    description: 'Calcula IVA e IRPF según tipo de operación y porcentajes aplicables',
    agents: ['contable'],
    mcpServer: null,
    requiresConfirmation: false,
  },
  registrar_gasto: {
    id: 'registrar_gasto',
    description: 'Registra un gasto o factura recibida en Holded',
    agents: ['contable', 'facturas_recibidas'],
    mcpServer: 'mcp-holded',
    requiresConfirmation: true,
  },
  exportar_excel: {
    id: 'exportar_excel',
    description: 'Genera archivo Excel con datos financieros estructurados',
    agents: ['contable'],
    mcpServer: null,
    requiresConfirmation: false,
  },
  comparar_proveedores: {
    id: 'comparar_proveedores',
    description: 'Analiza PDFs de presupuestos de proveedores y genera tabla comparativa',
    agents: ['contable'],
    mcpServer: 'mcp-pdf',
    requiresConfirmation: false,
  },

  // --- Cobros ---
  listar_impagados: {
    id: 'listar_impagados',
    description: 'Lista facturas impagadas o vencidas desde Holded',
    agents: ['cobros'],
    mcpServer: 'mcp-holded',
    requiresConfirmation: false,
  },
  redactar_reclamacion: {
    id: 'redactar_reclamacion',
    description: 'Redacta email de reclamación de pago para una factura impagada',
    agents: ['cobros'],
    mcpServer: null,
    requiresConfirmation: true,
  },

  // --- Correo ---
  clasificar_email: {
    id: 'clasificar_email',
    description: 'Clasifica un email por categoría y urgencia',
    agents: ['inbox'],
    mcpServer: 'mcp-gmail',
    requiresConfirmation: false,
  },
  etiquetar_email: {
    id: 'etiquetar_email',
    description: 'Aplica etiquetas a emails en Gmail',
    agents: ['inbox'],
    mcpServer: 'mcp-gmail',
    requiresConfirmation: false,
  },
  proponer_respuesta: {
    id: 'proponer_respuesta',
    description: 'Genera borrador de respuesta para un email',
    agents: ['inbox'],
    mcpServer: 'mcp-gmail',
    requiresConfirmation: true,
  },
  reenviar_email: {
    id: 'reenviar_email',
    description: 'Reenvía un email a otro destinatario',
    agents: ['inbox'],
    mcpServer: 'mcp-gmail',
    requiresConfirmation: true,
  },
  enviar_email: {
    id: 'enviar_email',
    description: 'Envía un email nuevo via Gmail',
    agents: ['cobros', 'propietarios'],
    mcpServer: 'mcp-gmail',
    requiresConfirmation: true,
  },
  descargar_adjunto: {
    id: 'descargar_adjunto',
    description: 'Descarga adjuntos de un email',
    agents: ['inbox', 'facturas_recibidas'],
    mcpServer: 'mcp-gmail',
    requiresConfirmation: false,
  },

  // --- PDF ---
  extraer_pdf: {
    id: 'extraer_pdf',
    description: 'Extrae datos estructurados de un PDF de factura',
    agents: ['facturas_recibidas', 'contable'],
    mcpServer: 'mcp-pdf',
    requiresConfirmation: false,
  },
  ocr_factura: {
    id: 'ocr_factura',
    description: 'OCR + extracción de datos de factura escaneada (imagen)',
    agents: ['facturas_recibidas'],
    mcpServer: 'mcp-pdf',
    requiresConfirmation: false,
  },
  verificar_comision: {
    id: 'verificar_comision',
    description: 'Verifica que las comisiones de Booking/Airbnb cuadran con los porcentajes esperados',
    agents: ['facturas_recibidas'],
    mcpServer: null,
    requiresConfirmation: false,
  },

  // --- PMS ---
  listar_cargos: {
    id: 'listar_cargos',
    description: 'Lista cargos pendientes de registrar para propietarios',
    agents: ['propietarios'],
    mcpServer: 'mcp-icnea',
    requiresConfirmation: false,
  },
  registrar_cargo_icnea: {
    id: 'registrar_cargo_icnea',
    description: 'Registra cargo a propietario en Icnea',
    agents: ['propietarios'],
    mcpServer: 'mcp-icnea',
    requiresConfirmation: true,
  },
  notificar_propietario: {
    id: 'notificar_propietario',
    description: 'Envía notificación por email a un propietario',
    agents: ['propietarios'],
    mcpServer: 'mcp-gmail',
    requiresConfirmation: true,
  },

  // --- Reviews ---
  consultar_reviews: {
    id: 'consultar_reviews',
    description: 'Obtiene reviews de Booking y/o Airbnb con filtros',
    agents: ['reviews'],
    mcpServer: 'mcp-booking',
    requiresConfirmation: false,
  },
  generar_informe_reviews: {
    id: 'generar_informe_reviews',
    description: 'Genera informe de reputación con métricas y tendencias',
    agents: ['reviews'],
    mcpServer: null,
    requiresConfirmation: false,
  },
  redactar_respuesta_review: {
    id: 'redactar_respuesta_review',
    description: 'Redacta respuesta personalizada a una review',
    agents: ['reviews'],
    mcpServer: null,
    requiresConfirmation: true,
  },
  proponer_mejora: {
    id: 'proponer_mejora',
    description: 'Propone mejoras operativas basadas en análisis de reviews',
    agents: ['reviews'],
    mcpServer: null,
    requiresConfirmation: false,
  },

  // --- Social ---
  publicar_post: {
    id: 'publicar_post',
    description: 'Publica contenido en una red social',
    agents: ['social'],
    mcpServer: 'mcp-social',
    requiresConfirmation: true,
  },
  programar_campana: {
    id: 'programar_campana',
    description: 'Programa campaña de publicaciones en redes sociales',
    agents: ['social'],
    mcpServer: 'mcp-social',
    requiresConfirmation: true,
  },
  seguimiento_lead: {
    id: 'seguimiento_lead',
    description: 'Actualiza estado y registra acción de seguimiento de un lead',
    agents: ['social'],
    mcpServer: null,
    requiresConfirmation: false,
  },
  publicar_blog: {
    id: 'publicar_blog',
    description: 'Publica artículo en blog/web',
    agents: ['social'],
    mcpServer: 'mcp-social',
    requiresConfirmation: true,
  },

  // --- Ops ---
  backup_financiero: {
    id: 'backup_financiero',
    description: 'Realiza backup de archivos financieros a Google Cloud Storage',
    agents: ['ops'],
    mcpServer: null,
    requiresConfirmation: false,
  },
  purgar_datos_rgpd: {
    id: 'purgar_datos_rgpd',
    description: 'Purga datos personales según política RGPD (requiere doble confirmación)',
    agents: ['ops'],
    mcpServer: null,
    requiresConfirmation: true,
  },
  health_check: {
    id: 'health_check',
    description: 'Verifica estado de conectividad con todos los MCP servers',
    agents: ['ops'],
    mcpServer: null,
    requiresConfirmation: false,
  },
};
