const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const processedCreditNotesPath = path.join(__dirname, 'processedCreditnotes.json');
const creditNoteRequestsDir = path.join(__dirname, 'CreditNoteRequests');
const correctInvoicesDir = path.join(__dirname, 'CorrectInvoices');
const relevantNumbersExcelPath = path.join(__dirname, 'relevantNumbers.xlsx');

// Ensure CorrectInvoices directory exists
if (!fs.existsSync(correctInvoicesDir)) {
	fs.mkdirSync(correctInvoicesDir);
}

// Build a map of relevantNumber -> { buyerPin, buyerName, traderSystemInvoiceNumber }
function buildRelevantNumberToBuyerMap() {
	const map = {};
	if (!fs.existsSync(relevantNumbersExcelPath)) return map;
	const workbook = xlsx.readFile(relevantNumbersExcelPath);
	const sheetName = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];
	const range = xlsx.utils.decode_range(worksheet['!ref']);
	for (let row = range.s.r + 1; row <= range.e.r; ++row) {
		const traderInvoiceCell = worksheet[xlsx.utils.encode_cell({ c: 0, r: row })]; // column A
		const invoiceCell = worksheet[xlsx.utils.encode_cell({ c: 1, r: row })]; // column B
		const buyerPinCell = worksheet[xlsx.utils.encode_cell({ c: 5, r: row })]; // column F
		const buyerNameCell = worksheet[xlsx.utils.encode_cell({ c: 6, r: row })]; // column G
		if (invoiceCell && invoiceCell.v) {
			const relevantNumber = invoiceCell.v.toString().trim();
			map[relevantNumber] = {
				traderSystemInvoiceNumber: traderInvoiceCell && traderInvoiceCell.v ? traderInvoiceCell.v.toString().trim() : '',
				buyerPin: buyerPinCell && buyerPinCell.v ? buyerPinCell.v.toString().trim() : '',
				buyerName: buyerNameCell && buyerNameCell.v ? buyerNameCell.v.toString().trim() : ''
			};
		}
	}
	return map;
}

function buildCorrectInvoice(creditNote, buyerInfo) {
	return {
		invoiceType: 0,
		transactionType: 0,
		cashier: "ADMIN",
		items: creditNote.items.map(item => {
			const obj = {
				name: item.name,
				quantity: item.quantity || 1,
				unitPrice: item.totalAmount || item.unitPrice
			};
			if (item.hsCode) obj.hsCode = item.hsCode;
			return obj;
		}),
		buyer: {
			buyerName: buyerInfo.buyerName,
			pinOfBuyer: buyerInfo.buyerPin
		},
		lines: [
			{
				lineType: "Text",
				alignment: "boldcenter",
				format: "Bold",
				value: "Thanksforyourbusiness!"
			}
		],
		payment: creditNote.payment,
		TraderSystemInvoiceNumber: buyerInfo.traderSystemInvoiceNumber
	};
}

async function createCorrectInvoices() {
	if (!fs.existsSync(processedCreditNotesPath)) {
		console.error('processedCreditnotes.json not found.');
		return;
	}
	const processedCreditNotes = JSON.parse(fs.readFileSync(processedCreditNotesPath, 'utf8'));
	const buyerMap = buildRelevantNumberToBuyerMap();
	for (const relevantNumber of processedCreditNotes) {
		const creditNoteFile = path.join(creditNoteRequestsDir, `${relevantNumber}.json`);
		if (!fs.existsSync(creditNoteFile)) {
			console.error(`Credit note request not found for ${relevantNumber}`);
			continue;
		}
		const creditNote = JSON.parse(fs.readFileSync(creditNoteFile, 'utf8'));
		const buyerInfo = buyerMap[relevantNumber];
		if (!buyerInfo || !buyerInfo.buyerPin || !buyerInfo.buyerName) {
			console.error(`Buyer info missing for ${relevantNumber}`);
			continue;
		}
		const correctInvoice = buildCorrectInvoice(creditNote, buyerInfo);
		fs.writeFileSync(
			path.join(correctInvoicesDir, `${relevantNumber}.json`),
			JSON.stringify(correctInvoice, null, 2)
		);
		console.log(`Correct invoice built for ${relevantNumber}`);
	}
	console.log('Step 4 complete: All correct invoices built.');
}

if (require.main === module) {
	createCorrectInvoices();
}

module.exports = { createCorrectInvoices };
