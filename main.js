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
    res.send(`
        <h2>TIMS Invoice Reverser API - Endpoint Documentation</h2>
        <ul>
            <li><b>GET /run-step1</b> - Run Step 1: Fetch Invoice Items from devices using Excel file</li>
            <li><b>GET /run-step2</b> - Run Step 2: Build Credit Note Requests from fetched items</li>
            <li><b>GET /run-step3</b> - Run Step 3: Process Credit Notes (send to device, save responses)</li>
            <li><b>GET /run-step4</b> - Run Step 4: Create Correct Invoices (generate new invoice data)</li>
            <li><b>GET /run-step5</b> - Run Step 5: Process Correct Invoices (send to device, save responses)</li>
        </ul>
        <h3>Usage</h3>
        <ul>
            <li>Visit each endpoint in order to run the workflow step-by-step.</li>
            <li>Each step must complete before running the next.</li>
            <li>All configuration (devices, etc.) is managed in <code>config.js</code>.</li>
            <li>Excel file <code>relevantNumbers.xlsx</code> must be present in the root directory.</li>
        </ul>
        <h3>Example</h3>
        <pre>
GET /run-step1
GET /run-step2
GET /run-step3
GET /run-step4
GET /run-step5
        </pre>
    `);
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
    console.log('\nAvailable Endpoints:');
    console.log('GET /run-step1 - Run Step 1: Fetch Invoice Items from devices using Excel file');
    console.log('GET /run-step2 - Run Step 2: Build Credit Note Requests from fetched items');
    console.log('GET /run-step3 - Run Step 3: Process Credit Notes (send to device, save responses)');
    console.log('GET /run-step4 - Run Step 4: Create Correct Invoices (generate new invoice data)');
    console.log('GET /run-step5 - Run Step 5: Process Correct Invoices (send to device, save responses)');
    console.log('\nVisit http://localhost:' + port + ' in your browser for more info.');
});
