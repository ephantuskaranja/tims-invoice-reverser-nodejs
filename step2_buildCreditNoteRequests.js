const fs = require('fs');
const path = require('path');

const itemResponsesDir = path.join(__dirname, 'ItemResponses');
const creditNoteRequestsDir = path.join(__dirname, 'CreditNoteRequests');

// Ensure CreditNoteRequests directory exists
if (!fs.existsSync(creditNoteRequestsDir)) {
	fs.mkdirSync(creditNoteRequestsDir);
}

function buildCreditNoteRequest(relevantNumber, data) {
	const items = (data.items || []).map(item => {
		const itemObj = {
			name: item.name,
			totalAmount: item.totalAmount
		};
		if (item.hsCode) itemObj.hsCode = item.hsCode;
		return itemObj;
	});
	const grandTotal = items.reduce((sum, item) => sum + Number(item.totalAmount), 0);
	return {
		invoiceType: 0,
		transactionType: 1,
		cashier: "ADMIN",
		items,
		relevantNumber,
		payment: [
			{
				amount: grandTotal,
				paymentType: "Cash"
			}
		]
	};
}

async function buildCreditNoteRequests() {
	const files = fs.readdirSync(itemResponsesDir).filter(f => f.endsWith('.json') && !f.endsWith('_error.json') && !f.endsWith('_.json'));
	for (const file of files) {
		const filePath = path.join(itemResponsesDir, file);
		let data;
		try {
			data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		} catch (err) {
			console.error(`Error parsing ${file}:`, err.message);
			continue;
		}
		if (data && data.messages && data.messages.toLowerCase() === 'success' && Array.isArray(data.items) && data.items.length > 0) {
			const relevantNumber = file.replace('.json', '');
			const creditNote = buildCreditNoteRequest(relevantNumber, data);
			fs.writeFileSync(
				path.join(creditNoteRequestsDir, `${relevantNumber}.json`),
				JSON.stringify(creditNote, null, 2)
			);
			console.log(`Credit note request built for ${relevantNumber}`);
		} else {
			console.log(`Skipping ${file}: not a successful item response.`);
		}
	}
	console.log('Step 2 complete: All credit note requests built.');
}

if (require.main === module) {
	buildCreditNoteRequests();
}

module.exports = { buildCreditNoteRequests };
