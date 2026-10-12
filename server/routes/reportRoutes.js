const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { ROLE } = require('../constants/roles');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const auth = require('../middleware/auth');
const Report = require('../models/Report');
const Booking = require('../models/Booking');
const User = require('../models/User'); // Add this import
const { sendNotification } = require('../utils/notifications');
const { getMemberIds, getLeadIds } = require('../utils/assignments');
const { toTechnicianView } = require('../utils/technicianView');
const { reportErrorResponse, validateReportInput } = require('../utils/reportErrors');
const { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES, consentProblem, readFlag } = require('../utils/reportEvidence');

// Same upload rules as the payment proofs: an unguessable file name in uploads/proofs, 5 MB at most.
// Only JPG and PNG are accepted for the photo of the signed paper form.
const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads/proofs');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
        cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
    },
});
const uploadPhoto = multer({
    storage: photoStorage,
    limits: { fileSize: PHOTO_MAX_BYTES },
    fileFilter: (req, file, cb) => {
        if (PHOTO_MIME_TYPES.includes(file.mimetype)) cb(null, true);
        else cb(new Error('The photo must be a JPG or PNG image.'));
    },
}).single('photo');

// Runs the upload and turns an upload problem (wrong type, too big) into a clear 400.
const receivePhoto = (req, res, next) => {
    uploadPhoto(req, res, (err) => {
        if (!err) return next();
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        res.status(400).json({ message: tooBig ? 'The photo must be 5 MB or smaller.' : err.message });
    });
};

// A rejected report must not leave its photo behind on disk.
const discardPhoto = (req) => {
    if (req.file) fs.unlink(req.file.path, () => {});
};

// The booking shown with a report. An admin gets it whole; anyone else, including the
// technician who wrote the report, only gets what a technician may see (no payment, proof,
// discount or refund data).
function detailsFor(req, booking) {
    if (!booking || req.userRole === ROLE.ADMIN) return booking;
    return toTechnicianView(booking.toObject());
}

// ============================================
// 1. CREATE REPORT
// ============================================

// Create a new report for a booking
router.post('/', auth, receivePhoto, async (req, res) => {
    try {
        const {
            bookingId,
            workSummary,
            partsUsed,
            recommendations,
            laborHours,
            issueResolution,
            followUpDate,
            notes,
            submittedAt,
            preExistingIssueDescription,
            clientConsentSignedName,
            clientConsentSignatureDataUrl,
        } = req.body;
        const followUpRequired = readFlag(req.body.followUpRequired);
        const preExistingIssueFlagged = readFlag(req.body.preExistingIssueFlagged);

        // Anything that stops the report below must not leave an uploaded photo behind.
        res.on('finish', () => { if (res.statusCode >= 400) discardPhoto(req); });

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

        if (preExistingIssueFlagged && !preExistingIssueDescription?.trim()) {
            return res.status(400).json({ message: 'Please describe the pre-existing issue.' });
        }

        const inputProblem = validateReportInput({ laborHours, issueResolution, followUpRequired, followUpDate });
        if (inputProblem) return res.status(inputProblem.status).json({ message: inputProblem.message });

        // The client's signature and name, or a photo of the signed paper form, finalize the report
        const evidenceProblem = consentProblem({
            signedName: clientConsentSignedName,
            signatureDataUrl: clientConsentSignatureDataUrl,
            hasPhoto: !!req.file,
        });
        if (evidenceProblem) return res.status(evidenceProblem.status).json({ message: evidenceProblem.message });

        // Find the booking
        const booking = await Booking.findOne({ bookingId });
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // A report is what finishes a job, so it is filed while the job is In Progress.
        // (A Completed booking is still accepted if it has no report yet, so jobs that were
        // completed before this rule existed can still get theirs.)
        if (![BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.COMPLETED].includes(booking.status)) {
            return res.status(400).json({
                message: 'A service report can only be submitted for a job that is in progress.'
            });
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
        if (!getMemberIds(booking).includes(req.userId)) {
            return res.status(403).json({ message: 'You are not assigned to this booking' });
        }
        // A team's helper can see the job but only a lead files the report.
        if (!getLeadIds(booking).includes(req.userId)) {
            return res.status(403).json({ message: 'Only the team lead can submit the service report.' });
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
            preExistingIssue: {
                flagged: preExistingIssueFlagged || false,
                description: preExistingIssueFlagged ? preExistingIssueDescription.trim() : null,
            },
            clientConsent: {
                signedName: clientConsentSignedName?.trim() || undefined,
                signatureDataUrl: clientConsentSignatureDataUrl || undefined,
                signedAt: new Date(),
            },
            signedFormPhoto: req.file ? `/uploads/proofs/${req.file.filename}` : undefined,
        });

        await report.save();

        // Update booking with report reference
        booking.reportId = report._id;
        booking.reportSubmitted = true;
        // Submitting the report is what completes the job (there is no manual "complete").
        // completedAt starts the warranty clock, the return-customer count and the service
        // reminder interval.
        booking.status = BOOKING_STATUS.COMPLETED;
        booking.completedAt = booking.completedAt || new Date();

        // Commercial payment terms count from completion, so the due date is only known now.
        if (booking.paymentTermsDays && !booking.paymentDueAt) {
            const dueAt = new Date(booking.completedAt);
            dueAt.setDate(dueAt.getDate() + booking.paymentTermsDays);
            booking.paymentDueAt = dueAt;
        }
        await booking.save();

        await sendNotification(
            booking.customer,
            NOTIFICATION_TYPE.BOOKING_COMPLETED,
            `Your service for booking ${booking.bookingId} is complete. You can now leave feedback from your booking details.`,
            { booking }
        );

        // Populate and return the report
        const populatedReport = await Report.findById(report._id)
            // Remove or comment out these populate calls since we're using string IDs
            // .populate('technicianId', 'name email')
            // .populate('bookingDetails');

        res.status(201).json(populatedReport);
    } catch (error) {
        const known = reportErrorResponse(error);
        if (known) return res.status(known.status).json({ message: known.message });
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
        if (req.userRole !== ROLE.ADMIN) {
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
                .populate('customer', 'name email clientType')
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
        if (req.userRole !== ROLE.ADMIN && report.technicianId !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Manually populate data
        const reportObj = report.toObject();
        const technician = await User.findOne({ _id: report.technicianId }).select('name email');
        reportObj.technician = technician;
        
        const booking = await Booking.findById(report.booking)
            .populate('customer', 'name email phone')
            .populate('service', 'name serviceType');
        reportObj.bookingDetails = detailsFor(req, booking);

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

        if (req.userRole !== ROLE.ADMIN && 
            booking.customer !== req.userId && 
            !getMemberIds(booking).includes(req.userId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Manually populate data
        const reportObj = report.toObject();
        const technician = await User.findOne({ _id: report.technicianId }).select('name email');
        reportObj.technician = technician;
        
        const bookingDetails = await Booking.findById(report.booking)
            .populate('customer', 'name email phone')
            .populate('service', 'name serviceType');
        reportObj.bookingDetails = detailsFor(req, bookingDetails);

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
        if (req.userRole !== ROLE.ADMIN && report.technicianId !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Don't allow updates to final reports
        if (report.isFinal && req.userRole !== ROLE.ADMIN) {
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
        if (req.userRole !== ROLE.ADMIN) {
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
                status: BOOKING_STATUS.IN_PROGRESS
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