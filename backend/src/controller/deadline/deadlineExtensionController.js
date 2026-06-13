const { pool: db } = require('../../../config/dbConfig');
const AppError = require('../../../utils/appError');
const { logger } = require('../../../utils/logger');
const { sendNotification } = require('../notification/notificationServicer');
const { sendDeadlineExtensionRequestEmail, sendDeadlineExtensionAcceptedEmail, sendDeadlineExtensionRejectedEmail } = require('../../../utils/deliveryEmails');

// Freelancer requests deadline extension
const requestDeadlineExtension = async (req, res, next) => {
    try {
        const freelancerId = req.user.roleWiseId;
        const { project_id, days, hours, reason } = req.body;

        if (!project_id || ((!days || days === 0) && (!hours || hours === 0))) {
            return next(new AppError('project_id and extension time (days or hours) are required', 400));
        }

        const totalDays = parseInt(days) || 0;
        const totalHours = parseInt(hours) || 0;

        if (totalDays < 0 || totalHours < 0 || totalHours > 23) {
            return next(new AppError('Invalid extension time. Days must be >= 0, hours must be 0-23', 400));
        }

        if (totalDays === 0 && totalHours === 0) {
            return next(new AppError('Extension time must be at least 1 hour', 400));
        }

        // Verify project belongs to this freelancer and is IN_PROGRESS
        const { rows: projects } = await db.query(
            `SELECT p.id, p.creator_id, p.status, p.end_date,
              c.full_name AS creator_name, c.email AS creator_email, c.user_id AS creator_user_id,
              f.freelancer_full_name, s.service_name
       FROM projects p
       JOIN creators c ON p.creator_id = c.creator_id
       JOIN freelancer f ON p.freelancer_id = f.freelancer_id
       LEFT JOIN services s ON p.service_id = s.id
       WHERE p.id = $1 AND p.freelancer_id = $2`,
            [project_id, freelancerId]
        );

        if (projects.length === 0) {
            return next(new AppError('Project not found or access denied', 404));
        }

        const project = projects[0];

        if (project.status !== 'IN_PROGRESS') {
            return next(new AppError('Can only request extension for IN_PROGRESS projects', 400));
        }

        // Check if there's already a pending extension request
        const { rows: existing } = await db.query(
            `SELECT id FROM deadline_extension_requested
       WHERE project_id = $1 AND status = 'pending'`,
            [project_id]
        );

        if (existing.length > 0) {
            return next(new AppError('A pending extension request already exists for this project', 409));
        }

        // Get chat room ID
        const { rows: chatRooms } = await db.query(
            `SELECT room_id FROM chat_rooms
       WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
            [req.user.user_id, project.creator_user_id]
        );

        const chatRoomId = chatRooms.length > 0 ? chatRooms[0].room_id : null;

        // Create extension request (expires in 7 days)
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const { rows: extension } = await db.query(
            `INSERT INTO deadline_extension_requested 
        (project_id, freelancer_id, creator_id, chat_room_id, days, hours, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING id`,
            [project_id, freelancerId, project.creator_id, chatRoomId, totalDays, totalHours, expiresAt]
        );

        logger.info(`Deadline extension requested: extension_id=${extension[0].id} project_id=${project_id} days=${totalDays} hours=${totalHours}`);

        // Send notification to creator
        const extensionText = totalDays > 0
            ? `${totalDays} day${totalDays > 1 ? 's' : ''}${totalHours > 0 ? ` and ${totalHours} hour${totalHours > 1 ? 's' : ''}` : ''}`
            : `${totalHours} hour${totalHours > 1 ? 's' : ''}`;

        const currentDeadlineStr = project.end_date
            ? new Date(project.end_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })
            : 'TBD';

        // For preview: Calculate from DATE only (ignore time) to match user expectation
        // since we only show date in email, not datetime
        const baseDate = new Date(project.end_date || new Date());
        baseDate.setHours(0, 0, 0, 0); // Reset to start of day
        const totalMillisecondsToAdd = (totalDays * 24 * 60 * 60 * 1000) + (totalHours * 60 * 60 * 1000);
        const newEndDate = new Date(baseDate.getTime() + totalMillisecondsToAdd);
        const newDeadlineStr = newEndDate.toLocaleDateString('en-IN', { dateStyle: 'medium' });

        logger.info(`Sending deadline extension notifications for project_id=${project_id}, creator=${project.creator_email}`);

        Promise.allSettled([
            sendNotification({
                recipientId: project.creator_user_id,
                senderId: req.user.user_id,
                eventType: 'deadline_extension_requested',
                title: 'Deadline Extension Requested',
                body: `${project.freelancer_full_name} has requested a deadline extension for Order #${project_id}. Please accept or decline within 7 days.`,
                actionType: 'link',
                actionRoute: String(extension[0].id),
            }),
            sendDeadlineExtensionRequestEmail({
                creatorEmail: project.creator_email,
                creatorName: project.creator_name,
                freelancerName: project.freelancer_full_name,
                freelancerUserId: req.user.user_id,
                projectId: project_id,
                serviceTitle: project.service_name,
                extensionTime: extensionText,
                currentDeadline: currentDeadlineStr,
                newDeadline: newDeadlineStr,
            }),
        ]).then((results) => {
            results.forEach((result, i) => {
                const labels = ['extension_requested notification', 'extension request email'];
                if (result.status === 'rejected') {
                    logger.error(`requestDeadlineExtension: ${labels[i]} failed: ${result.reason?.message}`, result.reason?.stack);
                } else {
                    logger.info(`requestDeadlineExtension: ${labels[i]} sent successfully`);
                }
            });
        }).catch(err => {
            logger.error(`requestDeadlineExtension: Promise.allSettled error: ${err.message}`, err.stack);
        });

        return res.status(201).json({
            status: 'success',
            message: 'Extension request sent',
            data: {
                extension_id: extension[0].id,
                days: totalDays,
                hours: totalHours,
                expires_at: expiresAt,
            },
        });
    } catch (error) {
        logger.error('requestDeadlineExtension error:', error);
        return next(new AppError('Failed to request deadline extension', 500));
    }
};

// Creator responds to deadline extension request
const respondToDeadlineExtension = async (req, res, next) => {
    try {
        const creatorId = req.user.roleWiseId;
        const { extension_id } = req.params;
        const { action } = req.body; // 'accept' or 'reject'

        if (!action || !['accept', 'reject'].includes(action)) {
            return next(new AppError('action must be "accept" or "reject"', 400));
        }

        // Get extension request details
        const { rows: extensions } = await db.query(
            `SELECT de.*, 
              p.end_date AS current_end_date, p.status AS project_status,
              f.freelancer_full_name, f.freelancer_email, f.user_id AS freelancer_user_id,
              c.full_name AS creator_name, c.email AS creator_email,
              s.service_name
       FROM deadline_extension_requested de
       JOIN projects p ON de.project_id = p.id
       JOIN freelancer f ON de.freelancer_id = f.freelancer_id
       JOIN creators c ON de.creator_id = c.creator_id
       LEFT JOIN services s ON p.service_id = s.id
       WHERE de.id = $1 AND de.creator_id = $2`,
            [extension_id, creatorId]
        );

        if (extensions.length === 0) {
            return next(new AppError('Extension request not found or access denied', 404));
        }

        const extension = extensions[0];

        if (extension.status !== 'pending') {
            return next(new AppError(`Extension request already ${extension.status}`, 400));
        }

        // Check if expired
        if (extension.expires_at && new Date(extension.expires_at) < new Date()) {
            await db.query(
                `UPDATE deadline_extension_requested SET status = 'expired' WHERE id = $1`,
                [extension_id]
            );
            return next(new AppError('Extension request has expired', 400));
        }

        const client = await db.connect();
        try {
            await client.query('BEGIN');

            if (action === 'accept') {
                // Update extension status
                await client.query(
                    `UPDATE deadline_extension_requested 
           SET status = 'accepted', approved_at = NOW() 
           WHERE id = $1`,
                    [extension_id]
                );

                // Update project end_date
                const newEndDate = new Date(extension.current_end_date);
                newEndDate.setDate(newEndDate.getDate() + extension.days);
                newEndDate.setHours(newEndDate.getHours() + extension.hours);

                await client.query(
                    `UPDATE projects SET end_date = $1, updated_at = NOW() WHERE id = $2`,
                    [newEndDate, extension.project_id]
                );

                await client.query('COMMIT');

                logger.info(`Deadline extension accepted: extension_id=${extension_id} new_end_date=${newEndDate.toISOString()}`);

                // Notify and email freelancer
                const extensionText = extension.days > 0
                    ? `${extension.days} day${extension.days > 1 ? 's' : ''}${extension.hours > 0 ? ` and ${extension.hours} hour${extension.hours > 1 ? 's' : ''}` : ''}`
                    : `${extension.hours} hour${extension.hours > 1 ? 's' : ''}`;

                const newDeadlineStr = newEndDate.toLocaleDateString('en-IN', { dateStyle: 'medium' });

                logger.info(`Sending extension accepted notifications for project_id=${extension.project_id}, freelancer=${extension.freelancer_email}`);

                Promise.allSettled([
                    sendNotification({
                        recipientId: extension.freelancer_user_id,
                        senderId: req.user.user_id,
                        eventType: 'deadline_extension_accepted',
                        title: 'Extension Request Accepted',
                        body: `Great news! ${extension.creator_name} has accepted your deadline extension for Order #${extension.project_id}. New deadline: ${newDeadlineStr}.`,
                        actionType: 'link',
                        actionRoute: String(extension.project_id),
                    }),
                    sendDeadlineExtensionAcceptedEmail({
                        freelancerEmail: extension.freelancer_email,
                        freelancerName: extension.freelancer_full_name,
                        creatorName: extension.creator_name,
                        creatorUserId: req.user.user_id,
                        projectId: extension.project_id,
                        serviceTitle: extension.service_name,
                        extensionTime: extensionText,
                        newDeadline: newDeadlineStr,
                    }),
                ]).then((results) => {
                    results.forEach((result, i) => {
                        const labels = ['extension_accepted notification', 'extension accepted email'];
                        if (result.status === 'rejected') {
                            logger.error(`respondToDeadlineExtension: ${labels[i]} failed: ${result.reason?.message}`, result.reason?.stack);
                        } else {
                            logger.info(`respondToDeadlineExtension: ${labels[i]} sent successfully`);
                        }
                    });
                }).catch(err => {
                    logger.error(`respondToDeadlineExtension (accept): Promise.allSettled error: ${err.message}`, err.stack);
                });

                return res.status(200).json({
                    status: 'success',
                    message: 'Extension request accepted',
                    data: {
                        extension_id,
                        new_deadline: newEndDate,
                    },
                });
            } else {
                // Reject
                await client.query(
                    `UPDATE deadline_extension_requested 
           SET status = 'rejected' 
           WHERE id = $1`,
                    [extension_id]
                );

                await client.query('COMMIT');

                logger.info(`Deadline extension rejected: extension_id=${extension_id}`);

                // Notify and email freelancer
                const currentDeadlineStr = extension.current_end_date
                    ? new Date(extension.current_end_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })
                    : 'TBD';

                logger.info(`Sending extension rejected notifications for project_id=${extension.project_id}, freelancer=${extension.freelancer_email}`);

                Promise.allSettled([
                    sendNotification({
                        recipientId: extension.freelancer_user_id,
                        senderId: req.user.user_id,
                        eventType: 'deadline_extension_rejected',
                        title: 'Extension Request Declined',
                        body: `${extension.creator_name} has declined your deadline extension for Order #${extension.project_id}. Original deadline remains: ${currentDeadlineStr}.`,
                        actionType: 'link',
                        actionRoute: String(extension.project_id),
                    }),
                    sendDeadlineExtensionRejectedEmail({
                        freelancerEmail: extension.freelancer_email,
                        freelancerName: extension.freelancer_full_name,
                        creatorName: extension.creator_name,
                        creatorUserId: req.user.user_id,
                        projectId: extension.project_id,
                        serviceTitle: extension.service_name,
                        currentDeadline: currentDeadlineStr,
                    }),
                ]).then((results) => {
                    results.forEach((result, i) => {
                        const labels = ['extension_rejected notification', 'extension rejected email'];
                        if (result.status === 'rejected') {
                            logger.error(`respondToDeadlineExtension: ${labels[i]} failed: ${result.reason?.message}`, result.reason?.stack);
                        } else {
                            logger.info(`respondToDeadlineExtension: ${labels[i]} sent successfully`);
                        }
                    });
                }).catch(err => {
                    logger.error(`respondToDeadlineExtension (reject): Promise.allSettled error: ${err.message}`, err.stack);
                });

                return res.status(200).json({
                    status: 'success',
                    message: 'Extension request rejected',
                    data: {
                        extension_id,
                    },
                });
            }
        } catch (txError) {
            await client.query('ROLLBACK');
            throw txError;
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error('respondToDeadlineExtension error:', error);
        return next(new AppError('Failed to respond to extension request', 500));
    }
};

// Get extension requests for a project
const getExtensionRequests = async (req, res, next) => {
    try {
        const { project_id } = req.params;
        const { role, roleWiseId } = req.user;

        // Verify user has access to this project
        const { rows: projects } = await db.query(
            `SELECT id, creator_id, freelancer_id
       FROM projects
       WHERE id = $1`,
            [project_id]
        );

        if (projects.length === 0) {
            return next(new AppError('Project not found', 404));
        }

        const project = projects[0];

        if (role !== 'admin' && project.creator_id !== roleWiseId && project.freelancer_id !== roleWiseId) {
            return next(new AppError('Access denied', 403));
        }

        // Get all extension requests for this project
        const { rows: extensions } = await db.query(
            `SELECT de.*,
              f.freelancer_full_name,
              c.full_name AS creator_name
       FROM deadline_extension_requested de
       JOIN freelancer f ON de.freelancer_id = f.freelancer_id
       JOIN creators c ON de.creator_id = c.creator_id
       WHERE de.project_id = $1
       ORDER BY de.requested_at DESC`,
            [project_id]
        );

        return res.status(200).json({
            status: 'success',
            data: { extensions },
        });
    } catch (error) {
        logger.error('getExtensionRequests error:', error);
        return next(new AppError('Failed to fetch extension requests', 500));
    }
};

module.exports = {
    requestDeadlineExtension,
    respondToDeadlineExtension,
    getExtensionRequests,
};
