const bcrypt = require("bcrypt");
const query = require("../../../../config/dbConfig");
const { decryptId } = require("../../../../config/encryptDecryptId");
const { logger } = require('../../../../utils/logger');
const AppError = require("../../../../utils/appError");

const registerUser = async (req, res, next) => {

  try {
    const { email, encryptedPassword, fullName, phoneNumber, role } = req.body;
    email = email?.trim().toLowerCase();
    if (!email || !encryptedPassword || !fullName || !phoneNumber || !role || role !== 'admin') {
      return next(new AppError("Missing required fields", 400));
    }
    const decryptedPassword = decryptId(encryptedPassword)?.trim();
    const hashedPassword = await bcrypt.hash(decryptedPassword, 10);


    const userRes = await query("SELECT * FROM users WHERE email = $1 ", [email]);
    if (userRes.rows.length > 0) {
      return next(new AppError("Email already registered with this role", 400));
    }
    const currentTimestamp = new Date().toUTCString();

    const { rows: registeredUser } = await query(
      "INSERT INTO users (user_email, user_role, user_password, created_at) VALUES ($1, $2, $3, $4 ) RETURNING *",
      [email, role, hashedPassword, currentTimestamp]
    );

    const { rows: userDetails } = await query("INSERT INTO user_details (user_id, full_name, phone_number, created_at) VALUES ($1, $2, $3, $4) RETURNING *", [registeredUser[0].id, fullName, phoneNumber, currentTimestamp]);

    return res.status(200).json({
      status: "success",
      message: "Signup successful"
    });


  } catch (error) {
    logger.error("Error during verification:", error);
    await query("INSERT INTO registration_failed_logs(email, message) VALUES($1, $2)", [email, 'Failed during verification process']);
    next(new AppError("Verification failed", 500));
  }
};

module.exports = { registerUser };
