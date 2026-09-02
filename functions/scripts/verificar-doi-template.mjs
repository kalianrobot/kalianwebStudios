#!/usr/bin/env node
// Verifica que la plantilla configurada en BREVO_NEWSLETTER_DOI_TEMPLATE_ID sea
// una plantilla DOI válida para POST /v3/contacts/doubleOptinConfirmation.
//
// Brevo solo acepta ahí plantillas que él marca como `doiTemplate: true`:
// activas y con un botón/enlace de tipo "Double opt-in link". Una plantilla
// transaccional normal produce el 400 "An active DOI template does not exist".
//
// Uso:
//   BREVO_API_KEY=xkeysib-... node functions/scripts/verificar-doi-template.mjs 14
//   BREVO_API_KEY=xkeysib-... node functions/scripts/verificar-doi-template.mjs        # lista todas

const apiKey = process.env.BREVO_API_KEY;
if (!apiKey) {
  console.error('Falta BREVO_API_KEY en el entorno.');
  process.exit(1);
}

const headers = { accept: 'application/json', 'api-key': apiKey };

async function get(path) {
  const res = await fetch(`https://api.brevo.com/v3${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Brevo ${res.status}:`, body.message || body);
    process.exit(1);
  }
  return body;
}

const arg = process.argv[2];

if (arg) {
  // `doiTemplate` solo viene en el detalle de una plantilla, no en el listado.
  const t = await get(`/smtp/templates/${Number(arg)}`);
  console.log(`Plantilla #${t.id} — ${t.name}`);
  console.log(`  activa      : ${t.isActive}`);
  console.log(`  doiTemplate : ${t.doiTemplate}`);
  console.log(`  remitente   : ${t.sender?.email}`);
  if (t.isActive && t.doiTemplate) {
    console.log('\nOK: sirve para doubleOptinConfirmation.');
  } else {
    console.log(
      '\nKO: Brevo la rechazará con "An active DOI template does not exist".\n' +
      'Actívala y añade un botón cuyo "Link settings" sea "Double opt-in link".'
    );
    process.exit(2);
  }
} else {
  const { templates = [] } = await get('/smtp/templates?limit=200&offset=0');
  console.log('Plantillas de la cuenta (doiTemplate requiere consulta individual):');
  for (const t of templates) {
    console.log(`  #${String(t.id).padEnd(5)} activa=${String(t.isActive).padEnd(5)} ${t.name}`);
  }
  console.log('\nRelanza con el ID para comprobar si es DOI: node functions/scripts/verificar-doi-template.mjs <id>');
}
