import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import cron from 'node-cron';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;
const LINK_CANAL = "https://whatsapp.com/channel/0029Vb8otv8BFLgTlSqipd1m";

// Servidor web y ruta de estado
app.get('/', (req, res) => {
  res.send('🤖 Bot de Tasas BCV Rinde+ está activo y operando en la nube.');
});

// NUEVA RUTA DE PRUEBA: Al entrar aquí desde el navegador, publica las tasas al instante
app.get('/probar', async (req, res) => {
  try {
    await publicarTasasBCV();
    res.send('✅ ¡Prueba ejecutada con éxito! Revisa tu canal de WhatsApp.');
  } catch (error) {
    res.status(500).send('❌ Error al ejecutar la prueba: ' + error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor web corriendo en el puerto ${PORT}`);
});

async function publicarTasasBCV() {
  console.log('\n[Prueba/Automático] Iniciando proceso de consulta de tasas...');
  try {
    const [resDolar, resEuro] = await Promise.all([
      fetch("https://ve.dolarapi.com/v1/dolares/oficial").catch(() => null),
      fetch("https://ve.dolarapi.com/v1/euros/oficial").catch(() => null)
    ]);

    let dolarValor = 'N/A';
    let euroValor = 'N/A';
    let fechaOficial = new Date().toLocaleDateString();

    if (resDolar && resDolar.ok) {
      const data = await resDolar.json();
      dolarValor = data.promedio || data.valor || data.precio || 'N/A';
      if (data.fechaActualizacion) {
        fechaOficial = data.fechaActualizacion.split('T')[0];
      }
    }

    if (resEuro && resEuro.ok) {
      const data = await resEuro.json();
      euroValor = data.promedio || data.valor || data.precio || 'N/A';
    }

    const mensaje = 
      `📊 *Tasas Oficiales BCV* | *Rinde+*\n` +
      `🗓️ Fecha: ${fechaOficial}\n\n` +
      `💵 *Dólar (USD):* ${dolarValor} VES\n` +
      `💶 *Euro (EUR):* ${euroValor} VES\n\n` +
      `_📈 Mantente al día con las finanzas descargando Rinde+._`;

    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection } = update;

      if (connection === 'open') {
        try {
          const inviteCode = LINK_CANAL.split('/').pop();
          const meta = await sock.newsletterMetadata("invite", inviteCode);
          const channelJid = meta.id;

          await sock.sendMessage(channelJid, { text: mensaje });
          console.log('[Prueba/Automático] ¡Tasas publicadas con éxito en el canal de WhatsApp!');
        } catch (err) {
          console.error('Error al enviar el mensaje al canal:', err);
        }
        
        setTimeout(() => {
          sock.end();
        }, 4000);
      }
    });

  } catch (error) {
    console.error('Error en el proceso:', error);
    throw error;
  }
}

// Programado todos los días a las 9:00 a.m. hora de Venezuela
cron.schedule('0 9 * * *', () => {
  publicarTasasBCV();
}, {
  scheduled: true,
  timezone: "America/Caracas"
});

console.log('🤖 Bot configurado en la nube con cron para las 9:00 a.m.');