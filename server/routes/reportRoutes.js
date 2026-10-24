const { NOTIFICATION_TYPE } = require('../constants/notificationTypes');
const { ROLE } = require('../constants/roles');
const { BOOKING_STATUS } = require('../constants/bookingStatus');
const auditSpecs = require('../utils/auditSpecs');
const { PAYMENT_STATUS, BALANCE_PAYMENT_STATUS } = require('../constants/paymentStatus');
const { safeProofName, PROOF_PREFIX } = require('../utils/fileAccess');
const { sendRouteError } = require('../utils/routeErrors');
const express = require('express');
const router = express.Router();
const { requireObjectId } = require('../utils/idParam');
requireObjectId(router, 'id');
const auth = require('../middleware/auth');
const Report = require('../models/Report');
const Booking = require('../models/Booking');
const User = require('../models/User'); // Add this import
const { sendNotification } = require('../utils/notifications');
const { getMemberIds, getLeadIds, getPrimaryLeadId, memberFilter, ASSIGNMENT_POPULATE } = require('../utils/assignments');
const { toTechnicianView } = require('../utils/technicianView');
const { addDays: addDaysFromInstant } = require('../utils/warranty');
const { toCustomerView, toCustomerReport } = require('../utils/customerView');
const BackJob = require('../models/BackJob');
const { TECHNICIAN_BOOKING_FILTER, isHiddenFromTechnicians } = require('../utils/technicianVisibility');
const { manilaTodayKey } = require('../utils/timeBlocks');
const { createUploader, discardUploads, storeUploads, PHOTO_TYPES } = require('../utils/uploadSafety');
const { uploadLimiter } = require('../middleware/rateLimit');
const { KINDS, getStore } = require('../storage/fileStore');
const { reportErrorResponse, validateReportInput, validateReportSections } = require('../utils/reportErrors');
const { PHOTO_MAX_BYTES, consentProblem, signatureProblem, readFlag } = require('../utils/reportEvidence');

// The photo of the signed paper form: JPG or PNG only, 5 MB at most, random stored name with an
// extension from the validated type, first bytes checked (utils/uploadSafety.js).
const receivePhoto = createUploader({
    allowedTypes: PHOTO_TYPES,
    maxBytes: PHOTO_MAX_BYTES,
}).single('photo');

// The booking shown with a report. An admin gets it whole; the owning customer only what a customer may
// see; a technician only what a technician may see (no payment, proof, discount or refund data).
function detailsFor(req, booking) {
    if (!booking || req.userRole === ROLE.ADMIN) return booking;
    if (req.userRole === ROLE.CUSTOMER) return toCustomerView(booking.toObject());
    return toTechnicianView(booking.toObject());
}

// For a report on a back job visit: the claim, the original booking and the original report (if there is one),
// so the new report is linked to the job it follows. undefined for an ordinary booking.
async function backJobLink(booking) {
    if (!booking.isBackJob || !booking.backJobId) return undefined;
    const claim = await BackJob.findOne({ backJobId: booking.backJobId });
    if (!claim) return { backJobId: booking.backJobId };
    const original = await Report.findOne({ bookingId: claim.originalBookingId });
    return { backJobId: booking.backJobId, originalBookingId: claim.originalBookingId, originalReportId: original ? original._id : undefined };
}

// ============================================
// 1. CREATE REPORT
// ============================================

// Create a new report for a booking
router.post('/', auth, uploadLimiter, receivePhoto, async (req, res) => {
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
            preExistingIssueDescription,
            clientConsentSignedName,
            clientConsentSignatureDataUrl,
        } = req.body;
        const followUpRequired = readFlag(req.body.followUpRequired);
        const preExistingIssueFlagged = readFlag(req.body.preExistingIssueFlagged);

        // Anything that stops the report below must not leave an uploaded photo behind.
        res.on('finish', () => { if (res.statusCode >= 400) discardUploads(req); });

        // Validate required fields
        if (!bookingId) {
            return res.status(400).json({ message: 'Booking ID is required' });
        }

        // The paper's report sections, each answered on purpose: work summary, resolution, labor hours, follow-up.
        const sectionProblem = validateReportSections({
            workSummary, issueResolution, laborHours, followUpRequired: req.body.followUpRequired, followUpDate, today: manilaTodayKey(),
        });
        if (sectionProblem) return res.status(sectionProblem.status).json({ message: sectionProblem.message });

        if (preExistingIssueFlagged && !preExistingIssueDescription?.trim()) {
            return res.status(400).json({ message: 'Please describe the pre-existing issue.' });
        }

        const inputProblem = validateReportInput({ laborHours, issueResolution, followUpRequired, followUpDate, today: manilaTodayKey() });
        if (inputProblem) return res.status(inputProblem.status).json({ message: inputProblem.message });

        // The client's signature and name, or a photo of the signed paper form, finalize the report
        const evidenceProblem = consentProblem({
            signedName: clientConsentSignedName,
            signatureDataUrl: clientConsentSignatureDataUrl,
            hasPhoto: !!req.file,
        });
        if (evidenceProblem) return res.status(evidenceProblem.status).json({ message: evidenceProblem.message });
        // a drawn signature must be a real PNG or JPEG under 500 KB, whether or not a photo came with it
        const signatureIssue = signatureProblem(clientConsentSignatureDataUrl);
        if (signatureIssue) return res.status(signatureIssue.status).json({ message: signatureIssue.message });

        // Find the booking
        const booking = await Booking.findOne({ bookingId });
        if (!booking || isHiddenFromTechnicians(booking)) {
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
        // Only the primary technician (the first one on the job) files the one report; every other technician on it reads it.
        if (!getLeadIds(booking).includes(req.userId)) {
            return res.status(403).json({ message: 'Only the primary technician of this job files the service report. You can read it once it is filed.' });
        }
        if (getPrimaryLeadId(booking) !== req.userId) {
            return res.status(403).json({ message: 'Only the primary technician of this job files the service report. You can read it once it is filed.' });
        }

        // Create the report with string IDs
        const report = new Report({
            bookingId: booking.bookingId,
            booking: booking._id,
            technicianId: req.userId, // This is now a string
            workSummary: workSummary.trim(),
            partsUsed: partsUsed?.trim() || null,
            recommendations: recommendations?.trim() || null,
            laborHours: Number(laborHours), // required and checked above, so 0 is a real answer
            issueResolution, // required and checked above: no silent default
            followUpRequired: followUpRequired || false,
            followUpDate: followUpRequired ? new Date(followUpDate) : null,
            notes: notes?.trim() || null,
            // always the server's clock: a time sent by the client is never trusted
            submittedAt: new Date(),
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
            backJob: await backJobLink(booking),
        });

        // The report is saved first: the unique index on bookingId is what settles two quick submits, so a
        // job is never marked Completed on behalf of a report that was refused as a duplicate. The photo is written to the file
        // store just before, and removed again (by the finish hook above) if the report is refused or anything after it fails.
        await storeUploads(req, { kind: KINDS.SIGNED_FORM, bookingId: booking.bookingId });
        await report.save();

        // Update booking with report reference
        booking.reportId = report._id;
        booking.reportSubmitted = true;
        // Submitting the report is what completes the job (there is no manual "complete").
        // completedAt starts the warranty clock, the return-customer count and the service
        // reminder interval.
        // A job that is In Progress is being completed now, so its clock starts now, even if an older completion time
        // is still on it (left by a report that was deleted). A job that is already Completed and only now gets its
        // report (finished before reports were required) keeps the time it was completed.
        const wasCompleted = booking.status === BOOKING_STATUS.COMPLETED;
        booking.status = BOOKING_STATUS.COMPLETED;
        booking.completedAt = wasCompleted && booking.completedAt ? booking.completedAt : new Date();

        // Commercial payment terms count from completion, so the due date is only known now.
        if (booking.paymentTermsDays && !booking.paymentDueAt) {
            // the end of the Manila day that many days after completion
            booking.paymentDueAt = addDaysFromInstant(booking.completedAt, booking.paymentTermsDays);
        }
        try {
            await booking.save();
        } catch (bookingError) {
            // Without a transaction the two writes cannot be one step, so undo the first: no report may be
            // left on a job that never became Completed (it would block a retry with "already exists").
            await Report.deleteOne({ _id: report._id }).catch((undoError) => {
                console.error(`Could not roll back report ${report._id} after the booking update failed:`, undoError);
            });
            throw bookingError;
        }

        // The report and the Completed status are saved. A notification problem must not turn that into an
        // error (the technician would retry a report that already exists), so it is only logged.
        try {
            await sendNotification(
                booking.customer,
                NOTIFICATION_TYPE.BOOKING_COMPLETED,
                `Your service for booking ${booking.bookingId} is complete. You can now leave feedback from your booking details.`,
                { booking }
            );
        } catch (notifyError) {
            console.error(`Could not notify the customer about booking ${booking.bookingId}:`, notifyError);
        }

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

// Every report for the jobs the logged-in technician leads, in one request (the Reports page used to ask
// once per completed job). Only the lead files a report, so the jobs are the ones they lead, plus any
// report they filed themselves. The author is looked up once for the whole list, by name only.
router.get('/technician/mine', auth, async (req, res) => {
    try {
        const jobs = await Booking.find({ ...memberFilter(req.userId), ...TECHNICIAN_BOOKING_FILTER }).select('bookingId technician assignments');
        const ledBookingIds = jobs.filter((j) => getLeadIds(j).includes(req.userId)).map((j) => j.bookingId);

        const reports = await Report.find({
            $or: [{ technicianId: req.userId }, { bookingId: { $in: ledBookingIds } }],
        }).sort({ submittedAt: -1 });

        const authorIds = [...new Set(reports.map((r) => r.technicianId))];
        const authors = await User.find({ _id: { $in: authorIds } }).select('name');
        const nameOf = new Map(authors.map((u) => [String(u._id), u.name]));

        res.json(reports.map((report) => ({
            ...report.toObject(),
            technician: { _id: report.technicianId, name: nameOf.get(String(report.technicianId)) || null },
        })));
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
        // a technician does not see a Pending booking, even one they are proposed for
        if (req.userRole !== ROLE.ADMIN && booking.customer !== req.userId && isHiddenFromTechnicians(booking)) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // The owning customer gets the whitelisted report: what the work was and how it ended, the signature, and the
        // technicians' names. Never a technician id, email or contact, notes, labor hours or anything from the admin.
        if (req.userRole === ROLE.CUSTOMER) {
            const forCustomer = await Booking.findById(report.booking)
                .populate('customer', 'name')
                .populate('service', 'name serviceType')
                .populate(ASSIGNMENT_POPULATE);
            const names = [...new Set((forCustomer?.assignments || []).flatMap((a) => [a.lead && a.lead.name, a.helper && a.helper.name]))];
            return res.json(toCustomerReport(report, forCustomer, names));
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
router.patch('/:id', auth, auditSpecs.reportEdit, async (req, res) => {
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

        const updates = req.body || {};
        const allowedUpdates = [
            'workSummary', 'partsUsed', 'recommendations',
            'laborHours', 'issueResolution', 'followUpRequired',
            'followUpDate', 'notes'
        ];
        const changed = allowedUpdates.filter((key) => updates[key] !== undefined);

        // The same rules as when the report was filed (work summary, resolution, labor hours in steps of 0.5, a follow-up
        // Yes or No with a date), checked on the report as it would be after the edit. A section an old report never had
        // and that this edit does not touch is not demanded now, and a follow-up date that is not being changed is not
        // held against the date today.
        const textTooLong = ['partsUsed', 'recommendations', 'notes', 'workSummary'].find((key) => updates[key] !== undefined && (typeof updates[key] !== 'string' || updates[key].length > 2000));
        if (textTooLong) return res.status(400).json({ message: `${textTooLong} must be text of 2000 characters or fewer.` });
        const stored = report.toObject();
        const touched = (key) => updates[key] !== undefined;
        const followUpDateKey = (value) => (value ? new Date(value).toISOString().slice(0, 10) : undefined);
        const candidate = {
            workSummary: touched('workSummary') ? updates.workSummary : stored.workSummary,
            issueResolution: touched('issueResolution') ? updates.issueResolution : (stored.issueResolution || 'Partial'),
            laborHours: touched('laborHours') ? updates.laborHours : (typeof stored.laborHours === 'number' ? stored.laborHours : 0),
            followUpRequired: touched('followUpRequired') ? updates.followUpRequired : !!stored.followUpRequired,
            followUpDate: touched('followUpDate') ? updates.followUpDate : followUpDateKey(stored.followUpDate),
        };
        const sectionProblem = validateReportSections({
            ...candidate,
            today: touched('followUpDate') || touched('followUpRequired') ? manilaTodayKey() : '0000-01-01',
        });
        if (sectionProblem) return res.status(sectionProblem.status).json({ message: sectionProblem.message });

        changed.forEach((key) => {
            report[key] = key === 'laborHours' ? Number(updates[key]) : updates[key];
        });
        if (touched('followUpRequired')) report.followUpRequired = updates.followUpRequired === true || updates.followUpRequired === 'true';
        if (touched('followUpRequired') && !report.followUpRequired) report.followUpDate = undefined;

        await report.save();
        res.json(report);
    } catch (error) {
        console.error('Error updating report:', error.message);
        sendRouteError(res, error);
    }
});

// Tells each lead of the job that the admin removed its report, so it needs a new one. A notification problem is only
// logged: the report is already gone.
async function notifyLeadsReportRemoved(booking) {
    for (const leadId of getLeadIds(booking)) {
        try {
            await sendNotification(
                leadId,
                NOTIFICATION_TYPE.REPORT_REMOVED,
                `The service report for booking ${booking.bookingId} was removed by the admin. The job is In Progress again: please submit a new report.`,
                { booking }
            );
        } catch (notifyError) {
            console.error(`Could not notify ${leadId} that a report was removed:`, notifyError);
        }
    }
}

// ============================================
// 4. DELETE REPORT (Admin only)
// ============================================

// Rules, in order. A reason (3 to 300 characters) is required and goes on the audit trail. The delete is refused (409) while
// a back job claim on this booking exists, or a later report links back to this one, because those need the report. It is
// also refused when the booking is already fully paid: taking a paid job back to In Progress would reopen a settled booking.
// Otherwise the report is deleted, its photo file is removed from disk, the booking goes back to In Progress (completion time
// cleared, so the warranty restarts with the next report) and every lead is told.
router.delete('/:id', auth, auditSpecs.reportDelete, async (req, res) => {
    try {
        if (req.userRole !== ROLE.ADMIN) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const reason = typeof (req.body && req.body.reason) === 'string' ? req.body.reason.trim() : '';
        if (reason.length < 3 || reason.length > 300) {
            return res.status(400).json({ message: 'Give a reason of 3 to 300 characters for deleting a service report.' });
        }

        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        const claim = await BackJob.findOne({ originalBookingId: report.bookingId });
        const linked = await Report.findOne({ 'backJob.originalReportId': report._id });
        if (claim || linked) {
            return res.status(409).json({ message: 'This report cannot be deleted: a back job claim depends on it. Deal with the claim first.' });
        }

        const booking = await Booking.findOne({ bookingId: report.bookingId });
        if (booking && (booking.paymentStatus === PAYMENT_STATUS.FULLY_PAID || booking.balancePaymentStatus === BALANCE_PAYMENT_STATUS.PAID)) {
            return res.status(409).json({ message: 'This report cannot be deleted: the booking is already fully paid, and deleting the report would reopen it. Edit the report instead.' });
        }

        await Booking.updateOne(
            { bookingId: report.bookingId },
            {
                $unset: { reportId: 1, completedAt: 1, paymentDueAt: 1 },
                $set: { reportSubmitted: false, status: BOOKING_STATUS.IN_PROGRESS },
            }
        );

        await report.deleteOne();
        await removeProofFile(report.signedFormPhoto);

        // The lead technician is told the job is open again and needs a new report.
        if (booking) await notifyLeadsReportRemoved(booking);
        res.json({ message: 'Report deleted successfully' });
    } catch (error) {
        console.error('Error deleting report:', error.message);
        sendRouteError(res, error);
    }
});

// Removes an uploaded proof or photo from the file store. Only a plain file name is ever touched, and a file that is already
// gone is fine.
async function removeProofFile(storedPath) {
    if (typeof storedPath !== 'string') return;
    if (!storedPath.startsWith(PROOF_PREFIX)) return;
    const name = safeProofName(storedPath.slice(PROOF_PREFIX.length));
    if (!name) return;
    try {
        await getStore().remove(name);
    } catch (err) {
        console.error('Could not remove a report photo:', err.message);
    }
}

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