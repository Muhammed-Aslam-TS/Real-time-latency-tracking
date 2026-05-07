const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const ping = require('ping');
const cors = require('cors');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit-table');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, './dist')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 5000;

// Default targets
let targets = [
    { id: '1', ip: '192.168.23.254', label: 'AMEXPGS23', history: [] },
    { id: '5', ip: '192.168.21.254', label: 'AMEXPGS21', history: [] },
    { id: '4', ip: '192.168.1.34', label: 'Main Gateway', history: [] },
    { id: '6', ip: '192.168.1.15', label: 'Main Gateway', history: [] },
    { id: '7', ip: '192.168.1.20', label: 'subhangi', history: [] },
    // { id: '2', ip: '8.8.8.8', label: 'Google DNS', history: [] },
    // { id: '3', ip: '1.1.1.1', label: 'Cloudflare DNS', history: [] }
];

const PING_INTERVAL = 3000; // 3 seconds

const performPings = async () => {
    for (let target of targets) {
        try {
            const res = await ping.promise.probe(target.ip, {
                timeout: 2,
            });
            
            const pingData = {
                targetId: target.id,
                ip: target.ip,
                alive: res.alive,
                time: res.time === 'unknown' ? 0 : parseFloat(res.time),
                min: res.min === 'unknown' ? 0 : parseFloat(res.min),
                max: res.max === 'unknown' ? 0 : parseFloat(res.max),
                avg: res.avg === 'unknown' ? 0 : parseFloat(res.avg),
                packetLoss: res.packetLoss === 'unknown' ? '0%' : res.packetLoss,
                timestamp: new Date().toISOString()
            };

            // Keep only last 50 results in history
            target.history.push(pingData);
            if (target.history.length > 50) target.history.shift();
            console.log(`Ping ${target.ip}: ${res.alive ? 'Up' : 'Down'} (${res.time}ms)`);
            io.emit('ping-update', pingData);
        } catch (error) {
            console.error(`Error pinging ${target.ip}:`, error);
        }
    }
};

// Start continuous pinging
setInterval(performPings, PING_INTERVAL);

// API Routes
app.get('/api/targets', (req, res) => {
    res.json(targets);
});

app.get('/api/report', (req, res) => {
    try {
        const allHistory = [];
        targets.forEach(target => {
            target.history.forEach(entry => {
                allHistory.push({
                    Label: target.label,
                    IP: target.ip,
                    Status: entry.alive ? 'Online' : 'Offline',
                    Latency_ms: entry.time,
                    Min_ms: entry.min,
                    Max_ms: entry.max,
                    Avg_ms: entry.avg,
                    Packet_Loss: entry.packetLoss,
                    Timestamp: entry.timestamp
                });
            });
        });

        if (allHistory.length === 0) {
            return res.status(404).json({ error: 'No data available for report' });
        }

        const fields = ['Label', 'IP', 'Status', 'Latency_ms', 'Min_ms', 'Max_ms', 'Avg_ms', 'Packet_Loss', 'Timestamp'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(allHistory);

        res.header('Content-Type', 'text/csv');
        res.attachment(`network_report_${new Date().toISOString().split('T')[0]}.csv`);
        return res.send(csv);
    } catch (err) {
        console.error('Report generation error:', err);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

app.get('/api/report-pdf', async (req, res) => {
    try {
        const rows = [];
        targets.forEach(target => {
            target.history.forEach(entry => {
                rows.push([
                    target.label,
                    target.ip,
                    entry.alive ? 'Online' : 'Offline',
                    `${entry.time} ms`,
                    `${entry.min} ms`,
                    `${entry.max} ms`,
                    `${entry.avg} ms`,
                    entry.packetLoss,
                    new Date(entry.timestamp).toLocaleString()
                ]);
            });
        });

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No data available for report' });
        }

        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
        
        // Filename for download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=network_report_${Date.now()}.pdf`);

        doc.pipe(res);

        doc.fontSize(20).text('Network Monitoring Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
        doc.moveDown();

        const table = {
            title: "Ping History Logs",
            headers: ["Label", "IP Address", "Status", "Latency", "Min", "Max", "Avg", "Loss %", "Timestamp"],
            rows: rows,
        };

        await doc.table(table, {
            prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
            prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
                doc.font("Helvetica").fontSize(10);
                indexColumn === 0 && doc.addBackground(rectRow, 'blue', 0.1);
            },
        });

        doc.end();
    } catch (err) {
        console.error('PDF Report generation error:', err);
        res.status(500).json({ error: 'Failed to generate PDF report' });
    }
});

const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 400, backgroundColour: 'white' });

app.get('/api/report-graph', async (req, res) => {
    try {
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=network_graph_report_${Date.now()}.pdf`);
        doc.pipe(res);

        doc.fontSize(24).text('Network Analytics: Visual Report', { align: 'center' });
        doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);

        for (const target of targets) {
            if (target.history.length === 0) continue;

            // Page break for each target if not the first one
            if (targets.indexOf(target) > 0) doc.addPage();

            doc.fontSize(18).fillColor('#3b82f6').text(target.label, { underline: true });
            doc.fontSize(12).fillColor('black').text(`IP Address: ${target.ip}`);
            doc.moveDown();

            // Prepare chart data
            const labels = target.history.map(h => new Date(h.timestamp).toLocaleTimeString());
            const dataPoints = target.history.map(h => h.time);

            const configuration = {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Latency (ms)',
                        data: dataPoints,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        pointRadius: 2,
                        fill: true,
                    }]
                },
                options: {
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'ms' }
                        }
                    }
                }
            };

            const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
            doc.image(imageBuffer, { width: 500, align: 'center' });
            doc.moveDown();

            // Summary Table
            const lastPing = target.history[target.history.length - 1];
            const table = {
                title: "Metrics Summary",
                headers: ["Metric", "Value"],
                rows: [
                    ["Current Status", lastPing.alive ? "Online" : "Offline"],
                    ["Min Latency", `${lastPing.min} ms`],
                    ["Max Latency", `${lastPing.max} ms`],
                    ["Avg Latency", `${lastPing.avg} ms`],
                    ["Packet Loss", lastPing.packetLoss],
                ]
            };

            await doc.table(table, { width: 300 });
            doc.moveDown();
        }

        doc.end();
    } catch (err) {
        console.error('Graph Report generation error:', err);
        res.status(500).json({ error: 'Failed to generate graph report' });
    }
});

app.post('/api/targets', (req, res) => {
    const { ip, label } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP is required' });
    
    const newTarget = {
        id: Date.now().toString(),
        ip,
        label: label || ip,
        history: []
    };
    targets.push(newTarget);
    res.status(201).json(newTarget);
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Send initial history
    socket.emit('initial-data', targets);

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Catch-all to serve index.html
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
