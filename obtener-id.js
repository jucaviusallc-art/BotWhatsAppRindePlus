import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

async function obtenerCanales() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_session');
  
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n--- ESCANEA ESTE CÓDIGO QR ---');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('\n¡Conexión exitosa! Buscando tu canal...');
      try {
        const channels = await sock.newsletterAdminList();
        console.log('=================================');
        console.log('       TUS CANALES ENCONTRADOS   ');
        console.log('=================================');
        channels.forEach(ch => {
          console.log(`Nombre: ${ch.subject}`);
          console.log(`👉 ID DEL CANAL (Copia este valor): ${ch.id}\n`);
        });
      } catch (error) {
        console.log('Conectado, pero no se pudo listar automáticamente.');
      }
      setTimeout(() => process.exit(0), 5000);
      
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`Conexión cerrada (Código: ${statusCode}).`);
      if (statusCode === DisconnectReason.loggedOut) {
        process.exit(1);
      } else {
        setTimeout(obtenerCanales, 3000);
      }
    }
  });
}

obtenerCanales();