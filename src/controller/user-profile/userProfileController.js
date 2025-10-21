const AppError = require("../../../utils/appError");
const query = require("../../../config/dbConfig");
const { decodedToken } = require("../../../utils/helper");
const { minioClient } = require("../../../config/minio");
const path = require('path');  // CommonJS
// const { BUCKET_NAME } = require("../../../config/minio");

const BUCKET_NAME = "freelancer-documents";
const expirySeconds = 4 * 60 * 60; // 4 hours

const getUserProfile = async (req, res, next) => {
  try {
    const user = decodedToken(req.cookies?.AccessToken);
    const tyep = req.query.type;
    if (tyep === "basicInfo") {
      // add logic to send profile image url as well
      const { rows: userBasicInfo } = await query(
        "select freelancer_full_name,date_of_birth,phone_number,profile_title,freelancer_email from freelancer where user_id=$1",
        [user.user_id]
      );
      console.log(userBasicInfo)
      return res.status(200).json({
        status: "success",
        data: {
          userBasicInfo: userBasicInfo[0],
        },
      });
    }else if(tyep==="profileImage"){
      const { rows: userProfileImage } = await query(
        "select profile_image_url from freelancer where user_id=$1",
        [user.user_id]
      );
      const userProfileImageUrl= userProfileImage[0]?.profile_image_url.split("/");
      const bucketName= userProfileImageUrl[2];
      const objectName = userProfileImageUrl.slice(3).join('/');
      const url = await minioClient.presignedGetObject(
        bucketName,
        objectName,
        expirySeconds
      )
      return res.status(200).json({
        status: "success",
        data: {
          userProfileImage: url,
        },
      });
    }
     else if (tyep === "govtId") {
      const { rows: userGovtId } = await query(
        "select gov_id_type,gov_id_url,gov_id_number from freelancer where user_id=$1",
        [user.user_id]
      );
      const userGovtIdUrl = userGovtId[0]?.gov_id_url.split("/");
      const bucketName = userGovtIdUrl[2];
      const objectName = userGovtIdUrl.slice(3).join("/");
      

      const url = await minioClient.presignedGetObject(
        bucketName,
        objectName,
        expirySeconds
      );
      return res.status(200).json({
        status: "success",
        data: {
          userGovtId: url,
          userGovtIdType: userGovtId[0]?.gov_id_type,
          userGovtIdNumber:userGovtId[0]?.gov_id_number
        },
      });
    } else if (tyep === "bankDetails") {
      const { rows: userBankDetails } = await query(
        "select bank_account_no,bank_name,bank_ifsc_code,bank_branch_name from freelancer where user_id=$1",
        [user.user_id]
      );
      return res.status(200).json({
        status: "success",
        data: {
          userBankDetails: userBankDetails[0],
        },
      });
    } else {
      return next(new AppError("Invalid type parameter", 400));
    }
  } catch (error) {
    return next(new AppError("Failed to get user profile", 500));
  }
};

const editProfile = async (req, res, next) => {
  try {
    const user = decodedToken(req.cookies?.AccessToken);
    const { type, userData } = req.body;
    if (!userData) {
      return next(new AppError("userData are required", 400));
    }
    if (type === "bankDetails") {
      const {
        freelancer_fullname,
        bank_account_no,
        bank_name,
        bank_ifsc_code,
        bank_branch_name,
      } = userData;
      if (
        !freelancer_fullname ||
        !bank_account_no ||
        !bank_name ||
        !bank_ifsc_code ||
        !bank_branch_name
      ) {
        return next(
          new AppError("All fields are required for bankDetails", 400)
        );
      }
      const { rows } = await query(
        "update freelancer set freelancer_full_name=$1,bank_account_no=$2,bank_name=$3,bank_ifsc_code=$4,bank_branch_name=$5 where user_id=$6 returning *",
        [
          freelancer_fullname,
          bank_account_no,
          bank_name,
          bank_ifsc_code,
          bank_branch_name,
          user.user_id,
        ]
      );
      return res.status(200).json({
        status: "success",
        message: "Bank details updated successfully",
        data: rows[0],
      });
    } else if (type === "govtId") {
      {
        const { gov_id_type,gov_id_number } = userData;

        if (!gov_id_type || !req.file) {
          return next(new AppError("All fields are required for govtId", 400));
        }
        // Upload file to MinIO
        const fileExt = path.extname(req.file.originalname);
        const fileName = `${crypto.randomUUID()}${fileExt}`;
        const folder = `goverment-doc/${gov_id_type}`;
        const objectName = `${folder}/${fileName}`;
        const gov_id_url = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;
        // Store in S3
        await minioClient.putObject(
          BUCKET_NAME,
          objectName,
          req.file.buffer,
          req.file.size,
          { "Content-Type": req.file.mimetype }
        );
        const { rows } = await query(
          "update freelancer set gov_id_type=$1,gov_id_url=$2,gov_id_number=$3 where user_id=$4 returning *",
          [gov_id_type, gov_id_url,gov_id_number, user.user_id]
        );
        return res.status(200).json({
          status: "success",
          message: "Government ID updated successfully",
        });
      }
    } else if (type === "profileImage") {
      if (!req.file) {
        return next(new AppError("profile image required!", 400));
      }
      const fileExt = path.extname(req.file.originalname);
      const fileName = `${crypto.randomUUID()}${fileExt}`;
      const folder = `freelancer-profile-image`;
      const objectName = `${folder}/${fileName}`;
      const profile_url = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;
      // Store in S3
      await minioClient.putObject(
        BUCKET_NAME,
        objectName,
        req.file.buffer,
        req.file.size,
        { "Content-Type": req.file.mimetype }
      );
      const { rows: storedUrl } = await query(
        "update freelancer set profile_image_url=$1 where user_id=$2 returning *",
        [profile_url, user.user_id]
      );
      return res.status(200).json({
        status: "success",
        message: "Profile image updated successfully",
      });
    } else {
      const {
        freelancer_fullname,
        freelancer_email,
        date_of_birth,
        phone_number,
        profile_title,
      } = userData;
      if (
        !freelancer_fullname ||
        !freelancer_email ||
        !date_of_birth ||
        !phone_number ||
        !profile_title
      ) {
        return next(new AppError("All fields are required for basicInfo", 400));
      }
      const { rows } = await query(
        "update freelancer set freelancer_full_name=$1,freelancer_email=$2,date_of_birth=$3,phone_number=$4,profile_title=$5 where user_id=$6 returning freelancer_full_name,freelancer_email,date_of_birth,phone_number,profile_title",
        [
          freelancer_fullname,
          freelancer_email,
          date_of_birth,
          phone_number,
          profile_title,
          user.user_id,
        ]
      );
      return res.status(200).json({
        status: "success",
        message: "Profile updated successfully",
        data: rows[0],
      });
    }
  } catch (error) {
    return next(new AppError("Failed to edit user profile", 500));
  }
};

module.exports = { getUserProfile, editProfile };
