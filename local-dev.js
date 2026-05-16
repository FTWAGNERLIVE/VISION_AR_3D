const express = require('express');
const selfsigned = require('selfsigned');
const https = require('https');
const fs = require('fs');

const app = express();
app.use(express.static('./'));

// Generate a self-signed certificate for HTTPS (Local testing)
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 365 });

const options = {
  key: pems.private,
  cert: pems.cert
};

const port = 3000;
https.createServer(options, app).listen(port, () => {
  console.log(`🚀 Servidor AR Local rodando!`);
  console.log(`Abra no navegador (ignore o aviso de segurança): https://localhost:${port}`);
  console.log(`Para acessar do celular, use o IP da sua máquina: https://<SEU-IP>:${port}`);
});
