require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Import step modules (make sure each exports a function as shown)
const step1 = require('./step1_fetchInvoiceItems');
let step2, step3, step4, step5;
try { step2 = require('./step2_buildCreditNoteRequests'); } catch {} 
try { step3 = require('./step3_processCreditNotes'); } catch {}
try { step4 = require('./step4_createCorrectInvoices'); } catch {}
try { step5 = require('./step5_processCorrectInvoices'); } catch {}

app.get('/', (req, res) => {
    res.send('<h2>TIMS Invoice Reverser API</h2><ul>' +
        '<li><a href="/run-step1">Run Step 1: Fetch Invoice Items</a></li>' +
        '<li><a href="/run-step2">Run Step 2: Build Credit Note Requests</a></li>' +
        '<li><a href="/run-step3">Run Step 3: Process Credit Notes</a></li>' +
        '<li><a href="/run-step4">Run Step 4: Create Correct Invoices</a></li>' +
        '<li><a href="/run-step5">Run Step 5: Process Correct Invoices</a></li>' +
        '</ul>');
});

app.get('/run-step1', async (req, res) => {
    try {
        await step1.fetchInvoiceItems();
        res.send('Step 1 complete: Invoice items fetched.');
    } catch (err) {
        res.status(500).send('Error in Step 1: ' + err.message);
    }
});

app.get('/run-step2', async (req, res) => {
    if (!step2) return res.status(404).send('Step 2 not implemented.');
    try {
        await step2.buildCreditNoteRequests();
        res.send('Step 2 complete: Credit note requests built.');
    } catch (err) {
        res.status(500).send('Error in Step 2: ' + err.message);
    }
});

app.get('/run-step3', async (req, res) => {
    if (!step3) return res.status(404).send('Step 3 not implemented.');
    try {
        await step3.processCreditNotes();
        res.send('Step 3 complete: Credit notes processed.');
    } catch (err) {
        res.status(500).send('Error in Step 3: ' + err.message);
    }
});

app.get('/run-step4', async (req, res) => {
    if (!step4) return res.status(404).send('Step 4 not implemented.');
    try {
        await step4.createCorrectInvoices();
        res.send('Step 4 complete: Correct invoices created.');
    } catch (err) {
        res.status(500).send('Error in Step 4: ' + err.message);
    }
});

app.get('/run-step5', async (req, res) => {
    if (!step5) return res.status(404).send('Step 5 not implemented.');
    try {
        await step5.processCorrectInvoices();
        res.send('Step 5 complete: Correct invoices processed.');
    } catch (err) {
        res.status(500).send('Error in Step 5: ' + err.message);
    }
});

app.listen(port, () => {
    console.log(`TIMS Invoice Reverser Express app listening at http://localhost:${port}`);
});
