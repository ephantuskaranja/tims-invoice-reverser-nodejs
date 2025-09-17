const processedCreditNotesPath = path.join(__dirname, 'processedCreditnotes.json');

function readProcessedCreditNotes() {
	if (!fs.existsSync(processedCreditNotesPath)) return [];
	try {
		return JSON.parse(fs.readFileSync(processedCreditNotesPath, 'utf8'));
	} catch {
		return [];
	}
}

function writeProcessedCreditNote(relevantNumber) {
	let processed = readProcessedCreditNotes();
	if (!processed.includes(relevantNumber)) {
		processed.push(relevantNumber);
		fs.writeFileSync(processedCreditNotesPath, JSON.stringify(processed, null, 2));
	}
}
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xlsx = require('xlsx');
const config = require('./config');
const http = require('http');
const agent = new http.Agent({ keepAlive: false });

const creditNoteRequestsDir = path.join(__dirname, 'CreditNoteRequests');
const creditNoteResponsesDir = path.join(__dirname, 'CreditNoteResponses');
const relevantNumbersExcelPath = path.join(__dirname, 'relevantNumbers.xlsx');

// Ensure CreditNoteResponses directory exists
if (!fs.existsSync(creditNoteResponsesDir)) {
	fs.mkdirSync(creditNoteResponsesDir);
}


// Build a map of relevantNumber -> deviceNumber from CreditNoteRequests filenames and Excel
function buildRelevantNumberToDeviceMapFromRequests(files) {
	const map = {};
	if (!fs.existsSync(relevantNumbersExcelPath)) return map;
	const workbook = xlsx.readFile(relevantNumbersExcelPath);
	const sheetName = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];
	const range = xlsx.utils.decode_range(worksheet['!ref']);
	// Build a lookup for deviceNumber by relevantNumber (from Excel)
	const excelMap = {};
	for (let row = range.s.r + 1; row <= range.e.r; ++row) {
		const invoiceCell = worksheet[xlsx.utils.encode_cell({ c: 1, r: row })]; // column B
		const deviceCell = worksheet[xlsx.utils.encode_cell({ c: 2, r: row })]; // column C
		if (invoiceCell && invoiceCell.v && deviceCell && deviceCell.v) {
			const invoiceNumber = invoiceCell.v.toString().trim();
			const deviceNumber = deviceCell.v.toString().trim();
			excelMap[invoiceNumber] = deviceNumber;
		}
	}
	// For each file, get relevantNumber from filename
	for (const file of files) {
		if (file.endsWith('.json')) {
			const relevantNumber = file.replace('.json', '').trim();
			if (excelMap[relevantNumber]) {
				map[relevantNumber] = excelMap[relevantNumber].trim();
			}
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

async function processCreditNotes() {
	const files = fs.readdirSync(creditNoteRequestsDir).filter(f => f.endsWith('.json'));
	const relevantNumberToDevice = buildRelevantNumberToDeviceMapFromRequests(files);
	const processedCreditNotes = readProcessedCreditNotes();
	for (const file of files) {
		const relevantNumber = file.replace('.json', '');
		if (processedCreditNotes.includes(relevantNumber)) {
			console.log(`Skipping already processed credit note: ${relevantNumber}`);
			continue;
		}
		const filePath = path.join(creditNoteRequestsDir, file);
		let creditNoteData;
		try {
			creditNoteData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		} catch (err) {
			console.error(`Error parsing ${file}:`, err.message);
			continue;
		}
	// ...existing code...
		const deviceNumber = relevantNumberToDevice[relevantNumber];
		const deviceIP = config.devices[deviceNumber];
		if (!deviceIP) {
			console.error(`No device IP found for device number: ${deviceNumber} (relevantNumber: ${relevantNumber})`);
			fs.writeFileSync(
				path.join(creditNoteResponsesDir, `${relevantNumber}_error.json`),
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
				path.join(creditNoteResponsesDir, `${relevantNumber}_error.json`),
				JSON.stringify({ error: 'PIN verification failed: ' + err.message }, null, 2)
			);
			continue;
		}
		if (verifyPinResponse !== '0100') {
			console.error(`Invalid pin verification for device ${deviceIP}`);
			fs.writeFileSync(
				path.join(creditNoteResponsesDir, `${relevantNumber}_error.json`),
				JSON.stringify({ error: 'Invalid pin verification' }, null, 2)
			);
			continue;
		}
		// Send credit note request
		try {
			const response = await axios.post(`${deviceIP}invoices`, creditNoteData, {
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json'
				},
				httpAgent: agent,
				timeout: 60000 // 60 seconds
			});
			const respData = response.data;
			if (respData && Object.prototype.hasOwnProperty.call(respData, 'mtn')) {
				fs.writeFileSync(
					path.join(creditNoteResponsesDir, `${relevantNumber}.json`),
					JSON.stringify(respData, null, 2)
				);
				writeProcessedCreditNote(relevantNumber);
				console.log(`Processed credit note for ${relevantNumber} (SUCCESS)`);
			} else {
				fs.writeFileSync(
					path.join(creditNoteResponsesDir, `${relevantNumber}_error.json`),
					JSON.stringify(respData, null, 2)
				);
				console.log(`Processed credit note for ${relevantNumber} (NO MTN, marked as error)`);
			}
		} catch (err) {
			console.error(`Error processing credit note for ${relevantNumber}:`, err.response?.data || err.code || err.message, err.stack);
			fs.writeFileSync(
				path.join(creditNoteResponsesDir, `${relevantNumber}_error.json`),
				JSON.stringify({ error: err.message }, null, 2)
			);
		}
	}
	console.log('Step 3 complete: All credit notes processed.');
}

if (require.main === module) {
	processCreditNotes();
}

module.exports = { processCreditNotes };
