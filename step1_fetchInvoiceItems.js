const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('./config');

const pin = process.env.PIN || '0000';

const xlsx = require('xlsx');
const relevantNumbersExcelPath = path.join(__dirname, 'relevantNumbers.xlsx');
const processedNumbersPath = path.join(__dirname, 'processedNumbers.json');
const itemResponsesDir = path.join(__dirname, 'ItemResponses');

// Ensure ItemResponses directory exists
if (!fs.existsSync(itemResponsesDir)) {
    fs.mkdirSync(itemResponsesDir);
}


// Read processed numbers
function readProcessedNumbers() {
    if (!fs.existsSync(processedNumbersPath)) return [];
    try {
        return JSON.parse(fs.readFileSync(processedNumbersPath, 'utf8'));
    } catch {
        return [];
    }
}

// Write processed number
function writeProcessedNumber(number) {
    let processed = readProcessedNumbers();
    if (!processed.includes(number)) {
        processed.push(number);
        fs.writeFileSync(processedNumbersPath, JSON.stringify(processed, null, 2));
    }
}
const config = require('./config');
const deviceIP = config.devices[Object.keys(config.devices)[0]]; // Use the first device IP from config

// Function to verify PIN
async function verifyPin(deviceIP, pin) {
    const response = await axiosInstance.post(`http://${deviceIP}:8086/api/v3/pin`, pin, {
        headers: {
            'Content-Type': 'text/plain',
            'Accept': 'application/json'
        },
        httpAgent: agent
    });
    return response.data;
}

async function fetchInvoiceItems() {
    if (!fs.existsSync(relevantNumbersExcelPath)) {
        console.error('Relevant numbers Excel file not found.');
        return;
    }
    let relevantNumbers = [];
    try {
        const workbook = xlsx.readFile(relevantNumbersExcelPath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const range = xlsx.utils.decode_range(worksheet['!ref']);
        for (let row = range.s.r + 1; row <= range.e.r; ++row) { // start from row 1 to skip header
            const cellAddress = { c: 1, r: row }; // column B (index 1)
            const cellRef = xlsx.utils.encode_cell(cellAddress);
            const cell = worksheet[cellRef];
            if (cell && cell.v) {
                relevantNumbers.push(cell.v.toString());
            }
        }
    } catch (err) {
        console.error('Error reading relevantNumbers.xlsx:', err);
        return;
    }
    if (!Array.isArray(relevantNumbers) || relevantNumbers.length === 0) {
        console.error('Relevant numbers is not a valid array or is empty.');
        return;
    }
    const processedNumbers = readProcessedNumbers();
    for (const invoiceNumber of relevantNumbers) {
        if (processedNumbers.includes(invoiceNumber)) {
            console.log(`Skipping already processed number: ${invoiceNumber}`);
            continue;
        }
        // Get device IP from config using invoiceNumber as key
        const deviceIP = config.devices[invoiceNumber];
        if (!deviceIP) {
            console.error(`No device IP found for invoice number: ${invoiceNumber}`);
            fs.writeFileSync(
                path.join(itemResponsesDir, `${invoiceNumber}.json`),
                JSON.stringify({ error: 'Device IP not found for this invoice number' }, null, 2)
            );
            writeProcessedNumber(invoiceNumber);
            continue;
        }
        // Verify PIN for the correct device
        let verifyPinResponse;
        try {
            verifyPinResponse = await verifyPin(deviceIP, pin);
        } catch (err) {
            console.error(`PIN verification failed for device ${deviceIP}:`, err.message);
            fs.writeFileSync(
                path.join(itemResponsesDir, `${invoiceNumber}.json`),
                JSON.stringify({ error: 'PIN verification failed: ' + err.message }, null, 2)
            );
            writeProcessedNumber(invoiceNumber);
            continue;
        }
        if (verifyPinResponse !== '0100') {
            console.error(`Invalid pin verification for device ${deviceIP}`);
            fs.writeFileSync(
                path.join(itemResponsesDir, `${invoiceNumber}.json`),
                JSON.stringify({ error: 'Invalid pin verification' }, null, 2)
            );
            writeProcessedNumber(invoiceNumber);
            continue;
        }
        try {
            const response = await axios.get(`${deviceIP}transactions/${invoiceNumber}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Connection': 'close'
                },
                httpAgent: agent
            });
            const data = response.data;
            fs.writeFileSync(
                path.join(itemResponsesDir, `${invoiceNumber}.json`),
                JSON.stringify(data, null, 2)
            );
            console.log(`Saved response for invoice ${invoiceNumber}`);
        } catch (err) {
            console.error(`Error fetching invoice ${invoiceNumber}:`, err.message);
            fs.writeFileSync(
                path.join(itemResponsesDir, `${invoiceNumber}.json`),
                JSON.stringify({ error: err.message }, null, 2)
            );
        }
        writeProcessedNumber(invoiceNumber);
    }
    console.log('Step 1 complete: All invoice items fetched.');
}

// Run if called directly
if (require.main === module) {
    fetchInvoiceItems();
}
