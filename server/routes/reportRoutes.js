const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Report = require('../models/Report');
const Booking = require('../models/Booking');
const User = require('../models/User'); // Add this import

// ============================================
// 1. CREATE REPORT
// ============================================

// Create a new report for a booking
router.post('/', auth, async (req, res) => {
    try {
        const { 
            bookingId, 
            workSummary, 
            partsUsed, 
            recommendations, 
            laborHours, 
            issueResolution, 
            followUpRequired, 
            followUpDate, 
            notes,
            submittedAt
        } = req.body;

        // Validate required fields
        if (!bookingId) {
            return res.status(400).json({ message: 'Booking ID is required' });
        }

        if (!workSummary || !workSummary.trim()) {
            return res.status(400).json({ message: 'Work summary is required' });
        }

        if (followUpRequired && !followUpDate) {
            return res.status(400).json({ message: 'Follow-up date is required when follow-up is needed' });
        }

        // Find the booking
        const booking = await Booking.findOne({ bookingId });
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Check if report already exists
        const existingReport = await Report.findOne({ bookingId });
        if (existingReport) {
            return res.status(400).json({ message: 'A report already exists for this booking' });
        }

        // Get the user to verify they exist
        const currentUser = await User.findOne({ _id: req.userId });
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify the technician is assigned to this booking
        // booking.technician is stored as a string (the custom ID like "STF3146")
        if (booking.technician !== req.userId) {
            return res.status(403).json({ message: 'You are not assigned to this booking' });
        }

        // Create the report with string IDs
        const report = new Report({
            bookingId: booking.bookingId,
            booking: booking._id,
            technicianId: req.userId, // This is now a string
            workSummary: workSummary.trim(),
            partsUsed: partsUsed?.trim() || null,
            recommendations: recommendations?.trim() || null,
            laborHours: laborHours ? parseFloat(laborHours) : null,
            issueResolution: issueResolution || 'Partial',
            followUpRequired: followUpRequired || false,
            followUpDate: followUpRequired ? new Date(followUpDate) : null,
            notes: notes?.trim() || null,
            submittedAt: submittedAt || new Date(),
            submittedBy: req.userId, // This is now a string
        });

        await report.save();

        // Update booking with report reference
        booking.reportId = report._id;
        booking.reportSubmitted = true;
        booking.status = 'Completed';
        booking.completedAt = new Date();
        await booking.save();

        // Populate and return the report
        const populatedReport = await Report.findById(report._id)
            // Remove or comment out these populate calls since we're using string IDs
            // .populate('technicianId', 'name email')
            // .populate('bookingDetails');

        res.status(201).json(populatedReport);
    } catch (error) {
        console.error('Error creating report:', error);
        res.status(500).json({ message: 'Error creating report' });
    }
});

// ============================================
// 2. GET REPORTS
// ============================================

// Get all reports for the logged-in technician
router.get('/technician/mine', auth, async (req, res) => {
    try {
        const reports = await Report.find({ technicianId: req.userId })
            .sort({ submittedAt: -1 });
        
        // Manually populate user data if needed
        const populatedReports = await Promise.all(reports.map(async (report) => {
            const reportObj = report.toObject();
            const user = await User.findOne({ _id: report.technicianId }).select('name email');
            reportObj.technician = user;
            return reportObj;
        }));
        
        res.json(populatedReports);
    } catch (error) {
        console.error('Error fetching technician reports:', error);
        res.status(500).json({ message: 'Error fetching reports' });
    }
});

// Get all reports (admin only)
router.get('/', auth, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const reports = await Report.find()
            .sort({ submittedAt: -1 });
        
        // Manually populate data
        const populatedReports = await Promise.all(reports.map(async (report) => {
            const reportObj = report.toObject();
            
            // Get technician
            const technician = await User.findOne({ _id: report.technicianId }).select('name email');
            reportObj.technician = technician;
            
            // Get booking details
            const booking = await Booking.findById(report.booking)
                .populate('customer', 'name email')
                .populate('service', 'name');
            reportObj.bookingDetails = booking;
            
            return reportObj;
        }));
        
        res.json(populatedReports);
    } catch (error) {
        console.error('Error fetching all reports:', error);
        res.status(500).json({ message: 'Error fetching reports' });
    }
});

// Get a single report by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        // Check if user has access to this report
        if (req.userRole !== 'admin' && report.technicianId !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Manually populate data
        const reportObj = report.toObject();
        const technician = await User.findOne({ _id: report.technicianId }).select('name email');
        reportObj.technician = technician;
        
        const booking = await Booking.findById(report.booking)
            .populate('customer', 'name email')
            .populate('service', 'name');
        reportObj.bookingDetails = booking;

        res.json(reportObj);
    } catch (error) {
        console.error('Error fetching report:', error);
        res.status(500).json({ message: 'Error fetching report' });
    }
});

// Get report by booking ID
router.get('/booking/:bookingId', auth, async (req, res) => {
    try {
        const report = await Report.findOne({ bookingId: req.params.bookingId });
        if (!report) {
            return res.status(404).json({ message: 'Report not found for this booking' });
        }

        // Check if user has access to this report
        const booking = await Booking.findOne({ bookingId: req.params.bookingId });
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        if (req.userRole !== 'admin' && 
            booking.customer !== req.userId && 
            booking.technician !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Manually populate data
        const reportObj = report.toObject();
        const technician = await User.findOne({ _id: report.technicianId }).select('name email');
        reportObj.technician = technician;
        
        const bookingDetails = await Booking.findById(report.booking)
            .populate('customer', 'name email')
            .populate('service', 'name');
        reportObj.bookingDetails = bookingDetails;

        res.json(reportObj);
    } catch (error) {
        console.error('Error fetching report by booking:', error);
        res.status(500).json({ message: 'Error fetching report' });
    }
});

// ============================================
// 3. UPDATE REPORT
// ============================================

// Update a report (only if not final)
router.patch('/:id', auth, async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        // Check if user is the technician who submitted it or admin
        if (req.userRole !== 'admin' && report.technicianId !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Don't allow updates to final reports
        if (report.isFinal && req.userRole !== 'admin') {
            return res.status(400).json({ message: 'This report is final and cannot be updated' });
        }

        const updates = req.body;
        const allowedUpdates = [
            'workSummary', 'partsUsed', 'recommendations', 
            'laborHours', 'issueResolution', 'followUpRequired', 
            'followUpDate', 'notes'
        ];

        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                report[key] = updates[key];
            }
        });

        // Validate follow-up date if required
        if (report.followUpRequired && !report.followUpDate) {
            return res.status(400).json({ message: 'Follow-up date is required when follow-up is needed' });
        }

        await report.save();
        res.json(report);
    } catch (error) {
        console.error('Error updating report:', error);
        res.status(500).json({ message: 'Error updating report' });
    }
});

// ============================================
// 4. DELETE REPORT (Admin only)
// ============================================

router.delete('/:id', auth, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        // Remove reference from booking
        await Booking.findOneAndUpdate(
            { bookingId: report.bookingId },
            { 
                $unset: { reportId: 1 },
                reportSubmitted: false,
                status: 'In Progress'
            }
        );

        await report.deleteOne();
        res.json({ message: 'Report deleted successfully' });
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({ message: 'Error deleting report' });
    }
});

// ============================================
// 5. STATISTICS
// ============================================

// Get report statistics for a technician
router.get('/stats/technician', auth, async (req, res) => {
    try {
        const totalReports = await Report.countDocuments({ technicianId: req.userId });
        const reportsWithFollowUp = await Report.countDocuments({ 
            technicianId: req.userId,
            followUpRequired: true 
        });
        const recentReports = await Report.find({ technicianId: req.userId })
            .sort({ submittedAt: -1 })
            .limit(5);

        res.json({
            totalReports,
            reportsWithFollowUp,
            recentReports
        });
    } catch (error) {
        console.error('Error fetching report stats:', error);
        res.status(500).json({ message: 'Error fetching statistics' });
    }
});

module.exports = router;