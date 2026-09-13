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
    await publicarTasasBCV(true); 
    res.send('✅ ¡Prueba ejecutada y publicada con éxito en el canal de WhatsApp!');
  } catch (error) {
    res.status(500).send('❌ Error al ejecutar la prueba: ' + error.message);
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

function formatearFechaVenezolana(fechaStr) {
  if (fechaStr && fechaStr.includes('-')) {
    let partes = fechaStr.split('T')[0].split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
  }
  const hoy = new Date();
  const d = String(hoy.getDate()).padStart(2, '0');
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  const y = hoy.getFullYear();
  return `${d}/${m}/${y}`;
}

async function publicarTasasBCV(esForzado = false) {
  const hoy = new Date();
  const diaSemana = hoy.getDay();

  if (!esForzado && (diaSemana === 0 || diaSemana === 6)) {
    console.log('[Análisis] Hoy es fin de semana (Sábado/Domingo). No se publicarán tasas automáticamente.');
    return;
  }

  console.log('\n[Análisis] Consultando tasas oficiales completas del BCV...');
  
  const res = await fetch("https://rates.dolarvzla.com/bcv/current.json").catch(() => null);

  let dolarValor = 0;
  let euroValor = 0;
  let yuanValor = 0;
  let liraValor = 0;
  let rubloValor = 0;
  let fechaCruda = "";

  if (res && res.ok) {
    const data = await res.json();
    if (data && data.current) {
      dolarValor = parseFloat(data.current.usd || data.current.USD || 0);
      euroValor = parseFloat(data.current.eur || data.current.EUR || 0);
      yuanValor = parseFloat(data.current.cny || data.current.CNY || data.current.yuan || 0);
      liraValor = parseFloat(data.current.try || data.current.TRY || data.current.lira || 0);
      rubloValor = parseFloat(data.current.rub || data.current.RUB || data.current.rublo || 0);
      if (data.current.date) {
        fechaCruda = data.current.date;
      }
    }
  }

  if (dolarValor === 0) {
    throw new Error("No se pudo obtener la tasa oficial del dólar desde la fuente.");
  }

  let fechaOficial = formatearFechaVenezolana(fechaCruda);

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
      `• Cambio: ${signo}${variacionBs.toFixed(2)} Bs\n` +
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
      `• Comportamiento Lunes a Viernes: ${signoSemana}${varSemanalBs.toFixed(2)} Bs (${signoSemana}${varSemanalPct.toFixed(2)}%)\n`;
  }

  if (esUltimoDiaMes && historial && historial.inicioMesDolar) {
    let varMensualBs = dolarValor - historial.inicioMesDolar;
    let varMensualPct = (varMensualBs / historial.inicioMesDolar) * 100;
    let signoMes = varMensualBs >= 0 ? "+" : "";
    
    textoReporteEspecial += 
      `\n🗓️ *Balance Mensual (Cierre de Mes):*\n` +
      `• Variación total del mes: ${signoMes}${varMensualBs.toFixed(2)} Bs (${signoMes}${varMensualPct.toFixed(2)}%)\n`;
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
    `💵 *Dólar (USD):* ${dolarValor.toFixed(2)} Bs\n` +
    `💶 *Euro (EUR):* ${euroValor.toFixed(2)} Bs\n` +
    `🇨🇳 *Yuan (CNY):* ${yuanValor.toFixed(4)} Bs\n` +
    `🇹🇷 *Lira Turca (TRY):* ${liraValor.toFixed(4)} Bs\n` +
    `🇷🇺 *Rublo (RUB):* ${rubloValor.toFixed(4)} Bs\n\n` +
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
        console.log('[Análisis] ¡Reporte completo con Bs publicado con éxito!');
      } catch (err) {
        console.error('Error al enviar al canal:', err);
      }
      setTimeout(() => { sock.end(); }, 4000);
    }
  });
}