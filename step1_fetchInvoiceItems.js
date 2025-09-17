const fs = require('fs');
const path = require('path');
const axios = require('axios');
const http = require('http');
const agent = new http.Agent({ keepAlive: false });
const config = require('./config');

const pin = process.env.DEVICE_PIN || '0000';

const xlsx = require('xlsx');
const relevantNumbersExcelPath = path.join(__dirname, 'relevantNumbers.xlsx');
const fetchedInvoiceNumberItemsPath = path.join(__dirname, 'fetchedInvoiceNumberItems.json');
const itemResponsesDir = path.join(__dirname, 'ItemResponses');

// Ensure ItemResponses directory exists
if (!fs.existsSync(itemResponsesDir)) {
    fs.mkdirSync(itemResponsesDir);
}

// Read fetched invoice numbers
function readFetchedInvoiceNumberItems() {
    if (!fs.existsSync(fetchedInvoiceNumberItemsPath)) return [];
    try {
        return JSON.parse(fs.readFileSync(fetchedInvoiceNumberItemsPath, 'utf8'));
    } catch {
        return [];
    }
}

// Write fetched invoice number
function writeFetchedInvoiceNumberItem(number) {
    let fetched = readFetchedInvoiceNumberItems();
    if (!fetched.includes(number)) {
        fetched.push(number);
        fs.writeFileSync(fetchedInvoiceNumberItemsPath, JSON.stringify(fetched, null, 2));
    }
}
const deviceIP = config.devices[Object.keys(config.devices)[0]]; // Use the first device IP from config

// Function to verify PIN
async function verifyPin(deviceIP, pin) {
    const response = await axios.post(`${deviceIP}pin`, pin, {
        headers: {
            'Content-Type': 'text/plain',
            'Accept': 'application/json'
        },
        httpAgent: agent,
        timeout: 30000 // 30 seconds
    });
    return response.data;
}

async function fetchInvoiceItems() {
    if (!fs.existsSync(relevantNumbersExcelPath)) {
        console.error('Relevant numbers Excel file not found.');
        return;
    }
    let invoiceDevicePairs = [];
    try {
        const workbook = xlsx.readFile(relevantNumbersExcelPath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const range = xlsx.utils.decode_range(worksheet['!ref']);
        for (let row = range.s.r + 1; row <= range.e.r; ++row) { // start from row 1 to skip header
            const invoiceCell = worksheet[xlsx.utils.encode_cell({ c: 1, r: row })]; // column B
            const deviceCell = worksheet[xlsx.utils.encode_cell({ c: 2, r: row })]; // column C
            if (invoiceCell && invoiceCell.v && deviceCell && deviceCell.v) {
                invoiceDevicePairs.push({
                    invoiceNumber: invoiceCell.v.toString().trim(),
                    deviceNumber: deviceCell.v.toString().trim()
                });
            }
        }
    } catch (err) {
        console.error('Error reading relevantNumbers.xlsx:', err);
        return;
    }
    if (!Array.isArray(invoiceDevicePairs) || invoiceDevicePairs.length === 0) {
        console.error('No valid invoice/device pairs found.');
        return;
    }
    const fetchedNumbers = readFetchedInvoiceNumberItems().map(num => num.trim());
    for (const { invoiceNumber, deviceNumber } of invoiceDevicePairs) {
        if (fetchedNumbers.includes(invoiceNumber.trim())) {
            console.log(`Skipping already fetched number: ${invoiceNumber}`);
            continue;
        }
        // Get device IP from config using deviceNumber as key
        const deviceIP = config.devices[deviceNumber];
        if (!deviceIP) {
            console.error(`No device IP found for device number: ${deviceNumber}`);
            fs.writeFileSync(
                path.join(itemResponsesDir, `${invoiceNumber}_error.json`),
                JSON.stringify({ error: 'Device IP not found for this device number' }, null, 2)
            );
            continue;
        }
        // Verify PIN for the correct device
        let verifyPinResponse;
        try {
            verifyPinResponse = await verifyPin(deviceIP, pin);
        } catch (err) {
            console.error(`PIN verification failed for device ${deviceIP}:`, err.message);
            fs.writeFileSync(
                path.join(itemResponsesDir, `${invoiceNumber}_error.json`),
                JSON.stringify({ error: 'PIN verification failed: ' + err.message }, null, 2)
            );
            continue;
        }
        console.log(`PIN verification response for device ${deviceIP}:`, verifyPinResponse);
        if (verifyPinResponse !== '0100') {
            console.error(`Invalid pin verification for device ${deviceIP}`);
            fs.writeFileSync(
                path.join(itemResponsesDir, `${invoiceNumber}_error.json`),
                JSON.stringify({ error: 'Invalid pin verification' }, null, 2)
            );
            continue;
        }
        try {
            console.log(`Fetching invoice number: ${invoiceNumber} from device ${deviceIP}`);
            const response = await axios.get(`${deviceIP}transactions/${invoiceNumber}`, {
                headers: {
                    'Accept': 'application/json',
                },
                httpAgent: agent,
                timeout: 120000 // 120 seconds
            });
            const data = response.data;
            if (data && data.messages && data.messages.toLowerCase() === 'success') {
                fs.writeFileSync(
                    path.join(itemResponsesDir, `${invoiceNumber}.json`),
                    JSON.stringify(data, null, 2)
                );
                console.log(`Saved SUCCESS response for invoice ${invoiceNumber}`);
                writeFetchedInvoiceNumberItem(invoiceNumber);
            } else {
                fs.writeFileSync(
                    path.join(itemResponsesDir, `${invoiceNumber}_error.json`),
                    JSON.stringify(data, null, 2)
                );
                console.log(`Saved NON-SUCCESS response for invoice ${invoiceNumber}`);
            }
        } catch (err) {
            console.error(`Error fetching invoice ${invoiceNumber}:`, err.response?.data || err.code || err.message, err.stack);
            fs.writeFileSync(
                path.join(itemResponsesDir, `${invoiceNumber}_error.json`),
                JSON.stringify({ error: err.message }, null, 2)
            );
        }
    }
    console.log('Step 1 complete: All invoice items fetched.');
}

// Run if called directly
if (require.main === module) {
    fetchInvoiceItems();
}

module.exports = { fetchInvoiceItems };
// End of file
