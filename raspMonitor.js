import os from 'os';
import fs from 'fs/promises';
import osUtils from 'os-utils';
import axios from 'axios';
import isOnline from 'is-online';
import { exec } from 'child_process';

const readRaspConfig = async () => {
    try {
        let filePath = `./pi_settings.json`;
        // console.log(filePath)
        const data = await fs.readFile(filePath, 'utf-8');
        console.log('settings', data)
        return JSON.parse(data ?? {})
    } catch (error) {
        console.error(`Error al enviar los datos a visitapp: ${error}`);
    }
}
const { apiUrl, megaResidencial, raspName } = await readRaspConfig();
// Nomeclatura=[nombre_residencial,Totem-Numero-Nombre_entrada,]
let offLineCounter = 0;
const maxOfflineCount = 5;
const minutesToUpdateData = 1;

const subtractSixHours = async (date) => {
    const adjustedDate = new Date(date);
    adjustedDate.setHours(adjustedDate.getHours() - 6);
    return adjustedDate;
}

const getPowerStatus = async () => {
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

const getTemperature = async () => {
    const tempPath = '/sys/class/thermal/thermal_zone0/temp';
    try {
        const temp = await fs.readFile(tempPath, 'utf8');
        return parseFloat(temp) / 1000;
    } catch (error) {
        console.error('Error al obtener la temperatura:', error);
        return null;
    }
}

const checkInternet = async () => {
    return await isOnline();
}

const getData = async () => {
    const currentTimestamp = new Date();
    const adjustedTimestamp = await subtractSixHours(currentTimestamp);
    const timestamp = adjustedTimestamp.toISOString();

    const cpuUsage = await new Promise((resolve) => {
        osUtils.cpuUsage((v) => {
            resolve(v * 100);
        });
    });

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsagePercentage = 100 - (freeMem / totalMem) * 100;

    const temperature = await getTemperature();
    const isConnected = await checkInternet();
    const hostname = raspName;
    const powerStatus = await getPowerStatus();

    return {
        timeStamp:timestamp,
        cpuUsage,
        memoryUsagePercentage,
        temperature,
        powerUsage: powerStatus,
        isConnected,
        hostName:hostname,
        offLineCounter, 
    };
}

const sendData = async () => {
    const data = await getData();
    // 
    // Verificar conexión a Internet y gestionar contador
    if (data.isConnected) {
        try {
            const endPoint = `/raspberrys/addRaspberry`
            console.log(`url------------>${apiUrl}${endPoint}`)
            console.log(`data------------>`)
            console.log(data)





            const { data: responseData } = await axios.post(`${apiUrl}${endPoint}`, data, {
                headers: {
                    'Content-Type': 'application/json',
                },
                redirect: 'manual'
            });


            console.log(`\n`)
            console.log(`data response from visitapp.la`)
            console.log(responseData)
            console.log(`\n`)



            if (responseData ?? false) {
                console.log('Enviando Datos...');
                if (responseData.estatus) {
                    console.log('!Online!')
                    offLineCounter = 0; // Reiniciar contador si está conectado
                }
            } else {
                console.error('Error al sincronizar:', responseData);
            }
        } catch (error) {
            console.error(`Error al enviar los datos a visitapp: ${error}`);
        }
    } else {
        offLineCounter++; // Incrementar contador si no está conectado
        responseData.offlineCounter = offLineCounter;
        console.log('Desconectado, intentos:', offLineCounter);
    }

    console.log('Valor de maxOfflineCount antes de verificar el reinicio:', maxOfflineCount);

    // Verificar si es necesario reiniciar
    if (offLineCounter >= maxOfflineCount) {
        console.log(`Reiniciando Raspberry Pi después de ${offLineCounter} inten                                             tos fallidos.`);
        exec('sudo reboot', (error, stdout, stderr) => {
            if (error) {
                console.error('Error al reiniciar la Raspberry Pi:', error);
                return;
            }
            console.log('Raspberry Pi reiniciada.');
        });
    }
}

if (!megaResidencial) {
    console.log('Esta configuracion solo es para un mega-residencial')

} else {
    await sendData()
    setInterval(async () => {
        await sendData()
    }, minutesToUpdateData * 60 * 1000);
    // Enviar datos a la API cada minuto
    console.log(`-----------Sincronizando con visitapp.la cada ${minutesToUpdateData} minutos---------`);

}


