import os from 'os';
import fs from 'fs';
import osUtils from 'os-utils';
import fetch from 'node-fetch';
import isOnline from 'is-online';
import { exec } from 'child_process';

const apiUrl = 'http://visitapp.la:3000/api'; 
const nombreRaspberry = 'Arras Entrada '; // Cambiar por nombre de la raspberry
let offlineCounter = 0;
const maxOfflineCount = 5;

function subtractSixHours(date) {
    const adjustedDate = new Date(date);
    adjustedDate.setHours(adjustedDate.getHours() - 6);
    return adjustedDate;
}

async function getPowerStatus() {
    return new Promise((resolve, reject) => {
        exec('vcgencmd measure_volts', (error, stdout, stderr) => {
            if (error) {
                console.error('Error ejecutando vcgencmd measure_volts:', error);
                reject(error);
            } else {
                const output = stdout.trim();
                const volts = parseFloat(output.split('=')[1].replace('V', ''));
                resolve(volts);
            }
        });
    });
}

function getTemperature() {
    const tempPath = '/sys/class/thermal/thermal_zone0/temp';
    try {
        const temp = fs.readFileSync(tempPath, 'utf8');
        return parseFloat(temp) / 1000;
    } catch (error) {
        console.error('Error al obtener la temperatura:', error);
        return null;
    }
}

async function checkInternet() {
    return await isOnline();
}

async function getData() {
    const currentTimestamp = new Date();
    const adjustedTimestamp = subtractSixHours(currentTimestamp);
    const timestamp = adjustedTimestamp.toISOString();

    const cpuUsage = await new Promise((resolve) => {
        osUtils.cpuUsage((v) => {
            resolve(v * 100);
        });
    });

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsagePercentage = 100 - (freeMem / totalMem) * 100;

    const temperature = getTemperature();
    const isConnected = await checkInternet();
    const hostname = nombreRaspberry;
    const powerStatus = await getPowerStatus();

    return {
        timeStamp:timestamp,
        cpuUsage,
        memoryUsagePercentage,
        temperature,
        powerUsage: powerStatus,
        isConnected,
        hostName:hostname,
        offLineCounter:offlineCounter, 
    };
}

async function sendData() {
    const data = await getData();

    // Verificar conexión a Internet y gestionar contador
    if (data.isConnected) {
        try {
            const endPoint=`/raspberrys/addRaspberry`
            const response = await fetch(apiUrl+endPoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
                redirect: 'manual'
            });
            if (response.ok) {
                console.log('Datos enviados a la API');
               const data=await response.json()
               console.log('data',data)
               if (data.estatus) {
                console.log('!Online!')
                offlineCounter = 0; // Reiniciar contador si está conectado
               }
            } else {
                console.log(data.description)

                console.error('Error al enviar los datos a la API:', response);
            }
        } catch (error) {
            console.error('Error al enviar los datos a la API:', error);
        }
    } else {
        offlineCounter++; // Incrementar contador si no está conectado
        data.offlineCounter = offlineCounter;
        console.log('Desconectado, intentos:', offlineCounter);
    }

    console.log('Valor de offlineCounter antes de verificar el reinicio:', offlineCounter);

    // Verificar si es necesario reiniciar
    if (offlineCounter >= maxOfflineCount) {
        console.log(`Reiniciando Raspberry Pi después de ${offlineCounter} inten                                             tos fallidos.`);
        exec('sudo reboot', (error, stdout, stderr) => {
            if (error) {
                console.error('Error al reiniciar la Raspberry Pi:', error);
                return;
            }
            console.log('Raspberry Pi reiniciada.');
        });
    }
}
// Enviar datos a la API cada minuto
setInterval(sendData, 1000 *60 );

console.log('Enviando datos a la API cada minuto');
