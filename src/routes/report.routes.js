const express = require('express');
const router = express.Router();
const reportService = require('../services/report.service');
const { authenticateToken } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authenticateToken);

// Get all logs
router.get('/logs', async (req, res) => {
    try {
        const { action, status, startDate, endDate, page = 1, limit = 50 } = req.query;

        const result = await reportService.getLogs(req.user.id, {
            action,
            status,
            startDate,
            endDate,
            page,
            limit
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// Get statistics
router.get('/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await reportService.getStatistics(req.user.id, { startDate, endDate });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// Get success rate by group
router.get('/success-rate', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await reportService.getSuccessRateByGroup(req.user.id, { startDate, endDate });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// Get posting activity (timeline)
router.get('/activity', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const result = await reportService.getPostingActivity(req.user.id, parseInt(days));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// Export logs to CSV
router.get('/export', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const csv = await reportService.exportLogs(req.user.id, { startDate, endDate });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="logs-${Date.now()}.csv"`);
        res.send(csv);
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// Delete old logs
router.delete('/logs/cleanup', async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const result = await reportService.cleanupOldLogs(req.user.id, parseInt(days));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

module.exports = router;