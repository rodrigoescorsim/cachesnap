const fetch = require('node-fetch');

async function createMonitor() {
  const url = 'https://github.com/fluidicon.png';
  const name = 'GitHub Icon Test ' + Date.now();
  
  console.log(`Creating monitor for ${url}...`);
  
  // We need a session, so I'll try to use the bypass or just look at logs
  // Actually, I can't easily fetch as a user without a cookie.
  
  console.log('Instructions: Add the monitor manually in the browser and watch the node/rust logs.');
}

createMonitor();
