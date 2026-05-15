/**
 * Vision3D — Servidor HTTPS Local
 * Auto-detecta o IP da rede e serve com HTTPS (para câmera no mobile)
 */

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const selfsigned = require('selfsigned');

const PORT_HTTPS = 3443;
const PORT_HTTP  = 3000;

// ── Detectar IP local ──────────────────────────────────────────────────────
function getLocalIP() {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// ── MIME types ─────────────────────────────────────────────────────────────
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css' : 'text/css',
    '.js'  : 'application/javascript',
    '.json': 'application/json',
    '.png' : 'image/png',
    '.jpg' : 'image/jpeg',
    '.svg' : 'image/svg+xml',
    '.ico' : 'image/x-icon',
    '.patt': 'text/plain',
    '.glb' : 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
};

// ── Request handler ────────────────────────────────────────────────────────
function handler(req, res) {
    let urlPath = req.url.split('?')[0];

    // API: retorna IP real do servidor
    if (urlPath === '/api/server-info') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({
            ip: localIP,
            port: PORT_HTTPS,
            arUrl: `https://${localIP}:${PORT_HTTPS}/ar.html`,
        }));
        return;
    }

    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    const filePath = path.join(__dirname, urlPath);
    const ext      = path.extname(filePath);
    const mime     = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 — Arquivo não encontrado');
            } else {
                res.writeHead(500);
                res.end('Erro interno do servidor');
            }
            return;
        }
        res.writeHead(200, {
            'Content-Type': mime,
            'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
    });
}

// ── Gerar certificado auto-assinado ───────────────────────────────────────
const localIP = getLocalIP();

console.log('\n🔐 Gerando certificado HTTPS...');
const attrs  = [{ name: 'commonName', value: localIP }];
const extensions = [
    { name: 'subjectAltName', altNames: [
        { type: 7, ip: localIP },
        { type: 7, ip: '127.0.0.1' },
    ]}
];
const pems = selfsigned.generate(attrs, {
    days: 365,
    extensions,
    keySize: 2048,
    algorithm: 'sha256',
});

// ── Subir servidores ───────────────────────────────────────────────────────

// HTTPS (câmera funciona aqui)
const httpsServer = https.createServer({ key: pems.private, cert: pems.cert }, handler);
httpsServer.listen(PORT_HTTPS, '0.0.0.0', () => {
    printBanner(localIP);
});

// HTTP → redireciona para HTTPS
const httpServer = http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host.replace(PORT_HTTP, PORT_HTTPS)}${req.url}` });
    res.end();
});
httpServer.listen(PORT_HTTP, '0.0.0.0');

// ── Banner no terminal ─────────────────────────────────────────────────────
function printBanner(ip) {
    const https_url = `https://${ip}:${PORT_HTTPS}`;
    const marker    = `${https_url}/marker.html`;
    const ar        = `${https_url}/ar.html`;

    console.log(`
╔══════════════════════════════════════════════════════╗
║              🌐  Vision3D  —  Servidor HTTPS         ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  📱 Acesse no celular (mesma rede Wi-Fi):            ║
║                                                      ║
║     ${https_url.padEnd(48)} ║
║                                                      ║
║  🎯 Páginas:                                         ║
║     Início   → ${https_url.padEnd(34)} ║
║     Marcador → ${marker.padEnd(34)} ║
║     AR       → ${ar.padEnd(34)} ║
║                                                      ║
║  ⚠️  Primeira vez? Aceite o aviso de certificado     ║
║     no browser do celular (é seguro — rede local)    ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
`);
}
