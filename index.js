import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import express from 'express';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;
const LINK_CANAL = "https://whatsapp.com/channel/0029Vb8otv8BFLgTlSqipd1m";
const HISTORIAL_FILE = 'historial.json';

app.get('/', (req, res) => {
  res.send('🤖 Bot de Tasas BCV Rinde+ con Estadísticas está activo en la nube.');
});

app.get('/probar', async (req, res) => {
  try {
    await publicarTasasBCV();
    res.send('✅ ¡Proceso verificado con éxito!');
  } catch (error) {
    res.status(500).send('❌ Error al ejecutar el reporte: ' + error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor web corriendo en el puerto ${PORT}`);
});

function obtenerHistorial() {
  if (fs.existsSync(HISTORIAL_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(HISTORIAL_FILE, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function guardarHistorial(datos) {
  fs.writeFileSync(HISTORIAL_FILE, JSON.stringify(datos, null, 2));
}

async function publicarTasasBCV() {
  const hoy = new Date();
  const diaSemana = hoy.getDay(); // 0 = Domingo, 1 = Lunes, ..., 5 = Viernes, 6 = Sábado

  // FILTRO DE FIN DE SEMANA: Si es sábado (6) o domingo (0), no hace nada y se detiene
  if (diaSemana === 0 || diaSemana === 6) {
    console.log('[Análisis] Hoy es fin de semana (Sábado/Domingo). No se publicarán tasas.');
    return;
  }

  console.log('\n[Análisis] Consultando tasas oficiales...');
  
  const [resDolar, resEuro] = await Promise.all([
    fetch("https://ve.dolarapi.com/v1/dolares/oficial").catch(() => null),
    fetch("https://ve.dolarapi.com/v1/euros/oficial").catch(() => null)
  ]);

  let dolarValor = 0;
  let euroValor = 0;
  let fechaOficial = hoy.toLocaleDateString();

  if (resDolar && resDolar.ok) {
    const data = await resDolar.json();
    dolarValor = parseFloat(data.promedio || data.valor || data.precio || 0);
    if (data.fechaActualizacion) {
      fechaOficial = data.fechaActualizacion.split('T')[0];
    }
  }

  if (resEuro && resEuro.ok) {
    const data = await resEuro.json();
    euroValor = parseFloat(data.promedio || data.valor || data.precio || 0);
  }

  if (dolarValor === 0) {
    throw new Error("No se pudo obtener la tasa oficial del dólar.");
  }

  let historial = obtenerHistorial();
  let variacionBs = 0;
  let variacionPct = 0;
  let textoEstadisticaDiaria = "";

  if (historial && historial.dolarValor) {
    variacionBs = (dolarValor - historial.dolarValor);
    variacionPct = ((variacionBs / historial.dolarValor) * 100);
    
    let signo = variacionBs >= 0 ? "+" : "";
    textoEstadisticaDiaria = 
      `📈 *Variación Diaria (USD):*\n` +
      `• Cambio: ${signo}${variacionBs.toFixed(2)} VES\n` +
      `• Porcentaje: ${signo}${variacionPct.toFixed(2)}%\n\n`;
  } else {
    textoEstadisticaDiaria = ""; 
  }

  const esViernes = diaSemana === 5;
  
  const manana = new Date(hoy);
  manana.setDate(hoy.getDate() + 1);
  const esUltimoDiaMes = manana.getDate() === 1;

  let textoReporteEspecial = "";

  if (esViernes && historial && historial.inicioSemanaDolar) {
    let varSemanalBs = dolarValor - historial.inicioSemanaDolar;
    let varSemanalPct = (varSemanalBs / historial.inicioSemanaDolar) * 100;
    let signoSemana = varSemanalBs >= 0 ? "+" : "";
    
    textoReporteEspecial += 
      `\n📅 *Resumen Semanal (Cierre de Semana):*\n` +
      `• Comportamiento Lunes a Viernes: ${signoSemana}${varSemanalBs.toFixed(2)} VES (${signoSemana}${varSemanalPct.toFixed(2)}%)\n`;
  }

  if (esUltimoDiaMes && historial && historial.inicioMesDolar) {
    let varMensualBs = dolarValor - historial.inicioMesDolar;
    let varMensualPct = (varMensualBs / historial.inicioMesDolar) * 100;
    let signoMes = varMensualBs >= 0 ? "+" : "";
    
    textoReporteEspecial += 
      `\n🗓️ *Balance Mensual (Cierre de Mes):*\n` +
      `• Variación total del mes: ${signoMes}${varMensualBs.toFixed(2)} VES (${signoMes}${varMensualPct.toFixed(2)}%)\n`;
  }

  let nuevoHistorial = {
    dolarValor: dolarValor,
    euroValor: euroValor,
    fecha: fechaOficial,
    inicioSemanaDolar: (esViernes || !historial || !historial.inicioSemanaDolar) ? dolarValor : historial.inicioSemanaDolar,
    inicioMesDolar: (esUltimoDiaMes || !historial || !historial.inicioMesDolar) ? dolarValor : historial.inicioMesDolar
  };
  guardarHistorial(nuevoHistorial);

  const mensaje = 
    `📊 *Tasas Oficiales BCV* | *Rinde+*\n` +
    `🗓️ Fecha: ${fechaOficial}\n\n` +
    `💵 *Dólar (USD):* ${dolarValor.toFixed(2)} VES\n` +
    `💶 *Euro (EUR):* ${euroValor.toFixed(2)} VES\n\n` +
    `${textoEstadisticaDiaria}` +
    `${textoReporteEspecial}` +
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
        console.log('[Análisis] ¡Reporte estadístico publicado con éxito en el canal!');
      } catch (err) {
        console.error('Error al enviar al canal:', err);
      }
      setTimeout(() => { sock.end(); }, 4000);
    }
  });
}