const query = require('../../config/dbConfig');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const AppError = require('../../utils/appError');
const { logger } = require('../../utils/logger');

const { sendNotificationToUser, broadcastNotification } = require('./helper');
const { sendMail, sendBatchMail } = require('../../config/email');

const saveNotificationToken = async (req, res, next) => {
  try {
    const { token, deviceType, deviceId } = req.body;
    // const userId = req.user?.id; // Safe access
    const authHeader = req.get('authorization');

    const headerToken = authHeader && authHeader.split(' ')[1];

    const secretKey = process.env.JWT_SECRET;
    const decoded = jwt.verify(headerToken, secretKey);

    const userId = decoded.sub;

    if (!userId) {
      return next(new AppError('User authentication required', 401));
    }

    if (!token) {
      return next(new AppError('FCM token is required', 400));
    }

    if (!deviceType) {
      return next(new AppError('Device type is required', 400));
    }

    if (!deviceId) {
      return next(new AppError('Device ID is required', 400));
    }

    // Validate token format (basic check)
    if (typeof token !== 'string' || token.length < 10) {
      return next(new AppError('Invalid FCM token format', 400));
    }

    // Check if user exists
    const userResult = await query('SELECT id FROM user_data WHERE id = $1', [userId]);
    if (userResult.length === 0) {
      return next(new AppError('User not found', 404));
    }
    if (deviceType == 'android' || deviceType == 'ios') {

      const upsertQuery = `
  INSERT INTO devices (user_id, device_token, device_type, device_id, is_active, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (device_id)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    device_token = EXCLUDED.device_token,
    device_type = EXCLUDED.device_type,
    is_active = EXCLUDED.is_active,
    updated_at = EXCLUDED.updated_at
  RETURNING id, device_token, device_type, device_id,
    (xmax = 0) as is_inserted`;

      const { rows: result } = await query(upsertQuery, [
        userId,
        token,
        deviceType,
        deviceId,
        true,
        new Date().toISOString(),
        new Date().toISOString()
      ]);
      if (result.is_inserted) {
        return res.status(200).json({
          status: 'success',
          message: 'FCM token saved successfully',
          data: {
            deviceId: result.id,
            userId,
            deviceType
          }
        });
      } else {
        return res.status(200).json({
          status: 'success',
          message: 'FCM token updated successfully',
          data: {
            deviceId: result.id,
            userId,
            deviceType
          }
        });
      }

    }
    const { rows: isTokenAvailable } = await query('select * from devices where device_token=$1', [token])

    if (isTokenAvailable.length != 0) {
      return res.status(200).json({
        status: 'success',
        message: 'FCM token already exist',
        data: {
          deviceId: isTokenAvailable.id,
          userId,
          deviceType,

        }
      });
    }
    // Use UPSERT (INSERT ... ON CONFLICT) for better handling
    const upsertQuery = `
      INSERT INTO devices (user_id, device_token, device_type, device_id, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, device_token, device_type, device_id`;

    const { rows: result } = await query(upsertQuery, [
      userId,
      token,
      deviceType,
      deviceId,
      true,
      new Date().toISOString(),
      new Date().toISOString()
    ]);
    logger.info('Upsert Result:', result[0], result);
    return res.status(200).json({
      status: 'success',
      message: 'FCM token saved successfully',
      data: {
        deviceId: result.id,
        userId,
        deviceType
      }
    });

  } catch (error) {
    logger.error('Error in saveNotificationToken:', error);
    return next(new AppError('Failed to save FCM token', 500));
  }
};

const testNotification = async (req, res, next) => {
  try {
    const { token, title, body, clickAction, imageUrl } = req.body;

    // Validate required fields
    if (!token) {
      return next(new AppError('FCM token is required', 400));
    }

    // Basic notification message
    const message = {
      token: token,
      notification: {
        title: title || 'Test Notification',
        body: body || 'This is a test notification',
        image: imageUrl
      },
      webpush: {
        fcm_options: {
          link: clickAction || 'https://chatgmp.ai4pharma.ai/'
        }
      }
    };

    // Send notification
    const response = await admin.messaging().send(message);

    res.json({
      status: 'success',
      message: 'Notification sent successfully',
      messageId: response
    });

  } catch (error) {
    logger.error('Error sending notification:', error);
    return next(new AppError('Failed to send notification', 500));
  }
}

const sendNotification = async (req, res, next) => {
  try {
    const { recipient_type, title, message, metadata, user_ids } = req.body;
    const io = req.app.get('io');
    if (recipient_type == 'specific_user') {
      user_ids.forEach(id => {
        const result = sendNotificationToUser(id, io, { title, message, metadata: metadata });
      });
      return res.status(200).json({
        status: 'success',
        message: "Notification sent successfully"
      })
    }
    const result = broadcastNotification(io, { title, message, sendTo: recipient_type, metadata: metadata });
    if (result.totalUsers == 0) {
      return next(new AppError('Failed to send notifications', 500));
    }
    return res.status(200).json({
      status: 'success',
      message: "Notification sent successfully"
    })
  }
  catch (err) {
    logger.error('Error sending notifcation :', err)
    return next(new AppError('Failed to send notifications', 500));
  }

}

// const saveNotificationtemplate = async (req, res,next) => {
//   try{
//     const { title, body, clickAction, imageUrl ,type,category} = req.body;

//     // Validate required fields
//     if (!title || !body || !type) {
//        return next (new AppError('Title, type and body are required', 400));
//     }

//     // Save the notification template to the database
//     const query = `
//       INSERT INTO notification_templates (type,category,title, body, click_action, image_url,is_active, created_at)
//       VALUES ($1, $2, $3, $4, $5, $6,false, $7)
//       RETURNING id
//     `;
//     const values = [type,category,title, body, clickAction || null, imageUrl || null, new Date().toISOString()];
//     const {rows:result} = await query(query, values);

//      return res.status(201).json({
//       message: 'Notification template saved successfully',
//       templateId: result.id
//     });
//   }
//   catch (error) {
//     logger.error('Error saving notification template:', error);
//     return next(new AppError('Failed to save notification template', 500));
//   }                                   
// }

const emailNotification = async (req, res, next) => {
  try {
    const { user_ids, subject, content: htmlTemplate, recipient_type } = req.body;
    logger.info('Email Notification Request:', req.body);

    // Validate required fields
    if (!subject || !htmlTemplate || !recipient_type) {
      return next(new AppError('subject, HTML template, and recipient type are required', 400));
    }
    switch (recipient_type) {
      case 'free user':
        params = 'LEFT JOIN user_block_logs AS ubl ON ubl.user_id = u.id WHERE ubl.user_id IS NULL and  u.is_internal_user = false and is_free_plan_active = true';
        break;

      case 'paid user':
        params = `
          JOIN razorpay_subscriptions rs 
          ON rs.user_id = u.id 
          WHERE rs.status = 'active'`;
        break;

      case "all":
        params = 'LEFT JOIN user_block_logs AS ubl ON ubl.user_id = u.id WHERE ubl.user_id IS NULL and  u.is_internal_user = false';
        break;

      case 'specific_user':
        params = ` WHERE u.id IN (${user_ids.join(',')})`;
        break;

      default:
        params = 'LEFT JOIN user_block_logs AS ubl ON ubl.user_id = u.id WHERE ubl.user_id IS NULL and  u.is_internal_user = false';
    }

    const usersQuery = `
                SELECT u.name, email
                FROM user_data u
                ${params}
            `;
    logger.info(usersQuery)
    const usersResult = await query(usersQuery);
    const allUsers = usersResult.rows;
    const users = allUsers.map(user => ({
      ...user,
      personalData: {
        name: user.name
      }
    }));

    // Send email using a mail service (e.g., Nodemailer)
    await sendBatchMail(users, subject, htmlTemplate, {
      onError: (error) => next(new AppError('Failed to send email', 500))
    });

    return res.status(200).json({
      status: 'sucess',
      message: 'Email sent successfully'
    });
  } catch (error) {
    logger.error('Error sending email:', error);
    return next(new AppError('Failed to send email', 500));
  }
};

module.exports = { saveNotificationToken, testNotification, sendNotification, emailNotification };