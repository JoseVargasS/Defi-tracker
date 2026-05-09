// js/bootstrap.js
// Loads optional local runtime config before the main app module.

try {
  await import(`./config.local.js?v=${Date.now()}`);
} catch {
  console.warn('No se encontro js/config.local.js. La app arrancara sin APIs privadas.');
}

await import('./main.js');
