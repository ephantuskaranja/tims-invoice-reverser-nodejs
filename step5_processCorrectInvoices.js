const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xlsx = require('xlsx');
const config = require('./config');
const http = require('http');
const agent = new http.Agent({ keepAlive: false });

const correctInvoicesDir = path.join(__dirname, 'CorrectInvoices');
const correctInvoiceResponsesDir = path.join(__dirname, 'CorrectInvoiceResponses');
const relevantNumbersExcelPath = path.join(__dirname, 'relevantNumbers.xlsx');
const processedCorrectInvoicesPath = path.join(__dirname, 'processedCorrectInvoices.json');

// Ensure CorrectInvoiceResponses directory exists
if (!fs.existsSync(correctInvoiceResponsesDir)) {
    fs.mkdirSync(correctInvoiceResponsesDir);
}

function readProcessedCorrectInvoices() {
    if (!fs.existsSync(processedCorrectInvoicesPath)) return [];
    try {
        return JSON.parse(fs.readFileSync(processedCorrectInvoicesPath, 'utf8'));
    } catch {
        return [];
    }
}

function writeProcessedCorrectInvoice(relevantNumber) {
    let processed = readProcessedCorrectInvoices();
    if (!processed.includes(relevantNumber)) {
        processed.push(relevantNumber);
        fs.writeFileSync(processedCorrectInvoicesPath, JSON.stringify(processed, null, 2));
    }
}

// Build a map of relevantNumber -> deviceNumber from Excel
function buildRelevantNumberToDeviceMap(files) {
    const map = {};
    if (!fs.existsSync(relevantNumbersExcelPath)) return map;
    const workbook = xlsx.readFile(relevantNumbersExcelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    for (let row = range.s.r + 1; row <= range.e.r; ++row) {
        const invoiceCell = worksheet[xlsx.utils.encode_cell({ c: 1, r: row })]; // column B
        const deviceCell = worksheet[xlsx.utils.encode_cell({ c: 2, r: row })]; // column C
        if (invoiceCell && invoiceCell.v && deviceCell && deviceCell.v) {
            const relevantNumber = invoiceCell.v.toString().trim();
            const deviceNumber = deviceCell.v.toString().trim();
            map[relevantNumber] = deviceNumber;
        }
    }
    return map;
}

async function verifyPin(deviceIP, pin) {
    const response = await axios.post(`${deviceIP}pin`, pin, {
        headers: {
            'Content-Type': 'text/plain',
            'Accept': 'application/json'
        },
        httpAgent: agent,
        timeout: 30000
    });
    return response.data;
}

async function processCorrectInvoices() {
    const files = fs.readdirSync(correctInvoicesDir).filter(f => f.endsWith('.json'));
    const relevantNumberToDevice = buildRelevantNumberToDeviceMap(files);
    const processedCorrectInvoices = readProcessedCorrectInvoices();
    for (const file of files) {
        const relevantNumber = file.replace('.json', '');
        if (processedCorrectInvoices.includes(relevantNumber)) {
            console.log(`Skipping already processed correct invoice: ${relevantNumber}`);
            continue;
        }
        const filePath = path.join(correctInvoicesDir, file);
        let invoiceData;
        try {
            invoiceData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
            console.error(`Error parsing ${file}:`, err.message);
            continue;
        }
        const deviceNumber = relevantNumberToDevice[relevantNumber];
        const deviceIP = config.devices[deviceNumber];
        if (!deviceIP) {
            console.error(`No device IP found for device number: ${deviceNumber} (relevantNumber: ${relevantNumber})`);
            fs.writeFileSync(
                path.join(correctInvoiceResponsesDir, `${relevantNumber}_error.json`),
                JSON.stringify({ error: 'Device IP not found for this device number' }, null, 2)
            );
            continue;
        }
        // Verify PIN
        let verifyPinResponse;
        try {
            verifyPinResponse = await verifyPin(deviceIP, process.env.DEVICE_PIN || '0000');
        } catch (err) {
            console.error(`PIN verification failed for device ${deviceIP}:`, err.message);
            fs.writeFileSync(
                path.join(correctInvoiceResponsesDir, `${relevantNumber}_error.json`),
                JSON.stringify({ error: 'PIN verification failed: ' + err.message }, null, 2)
            );
            continue;
        }
        if (verifyPinResponse !== '0100') {
            console.error(`Invalid pin verification for device ${deviceIP}`);
            fs.writeFileSync(
                path.join(correctInvoiceResponsesDir, `${relevantNumber}_error.json`),
                JSON.stringify({ error: 'Invalid pin verification' }, null, 2)
            );
            continue;
        }
        // Send correct invoice request
        try {
            const response = await axios.post(`${deviceIP}invoices`, invoiceData, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                httpAgent: agent,
                timeout: 120000
            });
            const respData = response.data;
            if (respData && Object.prototype.hasOwnProperty.call(respData, 'mtn')) {
                fs.writeFileSync(
                    path.join(correctInvoiceResponsesDir, `${relevantNumber}.json`),
                    JSON.stringify(respData, null, 2)
                );
                writeProcessedCorrectInvoice(relevantNumber);
                console.log(`Processed correct invoice for ${relevantNumber} (SUCCESS)`);
            } else {
                fs.writeFileSync(
                    path.join(correctInvoiceResponsesDir, `${relevantNumber}_error.json`),
                    JSON.stringify(respData, null, 2)
                );
                console.log(`Processed correct invoice for ${relevantNumber} (NO MTN, marked as error)`);
            }
        } catch (err) {
            console.error(`Error processing correct invoice for ${relevantNumber}:`, err.response?.data || err.code || err.message, err.stack);
            fs.writeFileSync(
                path.join(correctInvoiceResponsesDir, `${relevantNumber}_error.json`),
                JSON.stringify({ error: err.message }, null, 2)
            );
        }
    }
    console.log('Step 5 complete: All correct invoices processed.');
}

if (require.main === module) {
    processCorrectInvoices();
}

module.exports = { processCorrectInvoices };
