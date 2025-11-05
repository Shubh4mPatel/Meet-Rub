const AppError = require("../../../utils/appError");
const { query } = require("../../../config/dbConfig");
const { decodedToken } = require("../../../utils/helper");
const { minioClient } = require("../../../config/minio");
const path = require("path");
const crypto = require("crypto");
const {logger} = require("../../../utils/logger");

const BUCKET_NAME = "freelancer-documents";
const expirySeconds = 4 * 60 * 60; // 4 hours

// ✅ GET USER PROFILE
const getUserProfile = async (req, res, next) => {
  logger.info("Fetching user profile");
  try {

    const user = req.user
    logger.debug("Decoded User:", user);
    const type = req.query.type;
    logger.info(`Profile fetch type: ${type}`);

    if (!type) {
      logger.warn("Missing type parameter");
      return next(new AppError("type parameter is required", 400));
    }

    if (type === "basicInfo") {
      logger.info("Fetching: Basic Info");
      const { rows } = await query(
        "SELECT freelancer_full_name, date_of_birth, phone_number, profile_title, freelancer_email FROM freelancer WHERE user_id = $1",
        [user.user_id]
      );

      if (!rows[0]) {
        logger.warn("No basic info found");
        return next(new AppError("User profile not found", 404));
      }

      return res.status(200).json({
        status: "success",
        data: { userBasicInfo: rows[0] },
      });
    }

    if (type === "profileImage") {
      logger.info("Fetching: Profile Image");
      const { rows } = await query(
        "SELECT profile_image_url FROM freelancer WHERE user_id = $1",
        [user.user_id]
      );

      if (!rows[0]?.profile_image_url) {
        logger.warn("Profile image not uploaded");
        return next(new AppError("No profile image found", 404));
      }

      const parts = rows[0].profile_image_url.split("/");
      const bucketName = parts[2];
      const objectName = parts.slice(3).join("/");

      const signedUrl = await minioClient.presignedGetObject(
        bucketName,
        objectName,
        expirySeconds
      );

      return res.status(200).json({
        status: "success",
        data: { userProfileImage: signedUrl },
      });
    }

    if (type === "govtId") {
      logger.info("Fetching: Govt ID");
      const { rows } = await query(
        "SELECT gov_id_type, gov_id_url, gov_id_number FROM freelancer WHERE user_id = $1",
        [user.user_id]
      );

      if (!rows[0]?.gov_id_url) {
        logger.warn("Gov ID not uploaded");
        return next(new AppError("No govt ID found", 404));
      }

      const parts = rows[0].gov_id_url.split("/");
      const bucketName = parts[2];
      const objectName = parts.slice(3).join("/");

      const signedUrl = await minioClient.presignedGetObject(
        bucketName,
        objectName,
        expirySeconds
      );

      return res.status(200).json({
        status: "success",
        data: {
          userGovtIdUrl: signedUrl,
          userGovtIdType: rows[0]?.gov_id_type,
          userGovtIdNumber: rows[0]?.gov_id_number
        }
      });
    }

    if (type === "bankDetails") {
      logger.info("Fetching: Bank Details");
      const { rows } = await query(
        "SELECT bank_account_no, bank_name, bank_ifsc_code, bank_branch_name FROM freelancer WHERE user_id=$1",
        [user.user_id]
      );

      if (!rows[0]) {
        logger.warn("No bank details found");
        return next(new AppError("No bank details found", 404));
      }

      return res.status(200).json({
        status: "success",
        data: { userBankDetails: rows[0] },
      });
    }

    logger.warn("Invalid type parameter:", type);
    return next(new AppError("Invalid type parameter", 400));

  } catch (error) {
    logger.error("Error fetching profile:", error);
    return next(new AppError("Failed to get user profile", 500));
  }
};


// ✅ EDIT USER PROFILE
const editProfile = async (req, res, next) => {
  logger.info("Updating user profile");
  try {
    const user = req.user
    const { type, userData } = req.body;

    logger.debug("Edit request type:", type);
    logger.debug("Received Data:", userData);

    if (!type || !userData) {
      logger.warn("Missing type or data for profile update");
      return next(new AppError("type & userData required", 400));
    }

    if (type === "bankDetails") {
      logger.info("Updating bank details");

      const {
        freelancer_fullname,
        bank_account_no,
        bank_name,
        bank_ifsc_code,
        bank_branch_name,
      } = userData;

      if (!freelancer_fullname || !bank_account_no || !bank_name || !bank_ifsc_code || !bank_branch_name) {
        logger.warn("Missing bank details fields");
        return next(new AppError("All bank details required", 400));
      }

      const { rows } = await query(
        "UPDATE freelancer SET freelancer_full_name=$1, bank_account_no=$2, bank_name=$3, bank_ifsc_code=$4, bank_branch_name=$5 WHERE user_id=$6 RETURNING *",
        [freelancer_fullname, bank_account_no, bank_name, bank_ifsc_code, bank_branch_name, user.user_id]
      );

      logger.info("Bank details updated successfully");
      return res.status(200).json({
        status: "success",
        message: "Bank details updated successfully",
        data: rows[0],
      });
    }

    if (type === "govtId") {
      logger.info("Updating Govt ID");

      const { gov_id_type, gov_id_number } = userData;

      if (!gov_id_type || !req.file) {
        logger.warn("Missing fields for govt ID update");
        return next(new AppError("gov ID and file required", 400));
      }

      const fileExt = path.extname(req.file.originalname);
      const fileName = `${crypto.randomUUID()}${fileExt}`;
      const folder = `goverment-doc/${gov_id_type}`;
      const objectName = `${folder}/${fileName}`;
      const gov_id_url = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;

      await minioClient.putObject(BUCKET_NAME, objectName, req.file.buffer, req.file.size, {
        "Content-Type": req.file.mimetype
      });

      await query(
        "UPDATE freelancer SET gov_id_type=$1, gov_id_url=$2, gov_id_number=$3 WHERE user_id=$4",
        [gov_id_type, gov_id_url, gov_id_number, user.user_id]
      );

      logger.info("Govt ID updated successfully");
      return res.status(200).json({
        status: "success",
        message: "Government ID updated successfully",
      });
    }

    if (type === "profileImage") {
      logger.info("Updating Profile Image");

      if (!req.file) {
        logger.warn("Profile image missing");
        return next(new AppError("Profile image required", 400));
      }

      const fileExt = path.extname(req.file.originalname);
      const fileName = `${crypto.randomUUID()}${fileExt}`;
      const folder = "freelancer-profile-image";
      const objectName = `${folder}/${fileName}`;
      const profile_url = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;

      await minioClient.putObject(
        BUCKET_NAME,
        objectName,
        req.file.buffer,
        req.file.size,
        { "Content-Type": req.file.mimetype }
      );

      await query("UPDATE freelancer SET profile_image_url=$1 WHERE user_id=$2", [
        profile_url,
        user.user_id,
      ]);

      logger.info("Profile image updated successfully");
      return res.status(200).json({
        status: "success",
        message: "Profile image updated successfully",
      });
    }

    // ✅ BASIC DETAILS UPDATE
    logger.info("Updating basic info");
    const {
      freelancer_fullname,
      freelancer_email,
      date_of_birth,
      phone_number,
      profile_title,
    } = userData;

    if (!freelancer_fullname || !freelancer_email || !date_of_birth || !phone_number || !profile_title) {
      logger.warn("Missing basicInfo fields");
      return next(new AppError("All basic info fields required", 400));
    }

    const { rows } = await query(
      `UPDATE freelancer SET freelancer_full_name=$1, freelancer_email=$2, date_of_birth=$3, phone_number=$4, profile_title=$5 WHERE user_id=$6 
       RETURNING freelancer_full_name, freelancer_email, date_of_birth, phone_number, profile_title`,
      [freelancer_fullname, freelancer_email, date_of_birth, phone_number, profile_title, user.user_id]
    );

    logger.info("Basic info updated successfully");
    return res.status(200).json({
      status: "success",
      message: "Profile updated successfully",
      data: rows[0]
    });

  } catch (error) {
    logger.error("Error updating profile:", error);
    return next(new AppError("Failed to edit user profile", 500));
  }
};

module.exports = { getUserProfile, editProfile };
