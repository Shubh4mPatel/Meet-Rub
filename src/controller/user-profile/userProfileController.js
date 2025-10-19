const AppError = require("../../../utils/appError");
const query = require("../../../config/dbConfig");
const { decodedToken } = require("../../../utils/helper");

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
      return res.status(200).json({
        status: "success",
        data: {
          userBasicInfo: userBasicInfo[0],
        },
      });
    } else if (tyep === "govtId") {
      const { rows: userGovtId } = await query(
        "select gov_id_type,gov_id_url from freelancer where user_id=$1",
        [user.user_id]
      );
      return res.status(200).json({
        status: "success",
        data: {
          userGovtId: userGovtId[0],
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
    if (!type || !userData) {
      return next(new AppError("Type and userData are required", 400));
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
      await query(
        "update freelancer set freelancer_full_name=$1,bank_account_no=$2,bank_name=$3,bank_ifsc_code=$4,bank_branch_name=$5 where user_id=$6",
        [
          freelancer_fullname,
          bank_account_no,
          bank_name,
          bank_ifsc_code,
          bank_branch_name,
          user.user_id,
        ]
      );
    } else if (type === "govtId") {
      {
        const { gov_id_type, gov_id_url } = userData;
        if (!gov_id_type || !gov_id_url) {
          return next(new AppError("All fields are required for govtId", 400));
        }
        await query(
          "update freelancer set gov_id_type=$1,gov_id_url=$2 where user_id=$3",
          [gov_id_type, gov_id_url, user.user_id]
        );
      }
    } else if (type === "profileImage") {
      // Update profile image logic here
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
      await query(
        "update freelancer set freelancer_full_name=$1,freelancer_email=$2,date_of_birth=$3,phone_number=$4,profile_title=$5 where user_id=$6",
        [
          freelancer_fullname,
          freelancer_email,
          date_of_birth,
          phone_number,
          profile_title,
          user.user_id,
        ]
      );
    }
  } catch (error) {
    return next(new AppError("Failed to edit user profile", 500));
  }
};

module.exports = { getUserProfile, editProfile };