const { query } = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const { decodedToken } = require("../../../utils/helper");
const { minioClient, ensureBucketExists } = require("../../../config/minio");
const path = require("path");
const crypto = require("crypto");

const BUCKET_NAME='freelancer-portfolios';

const getPortfolioByFreelancerId = async (req, res, next) => {
  try {
    const user = decodedToken(req.cookies?.AccessToken);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    } 
   
  } catch (error) {
    return next(new AppError("Failed to get portfolio", 500));
  }
};

const addFreelancerPortfolio = async (req, res, next) => {

    try {
        const user = decodedToken(req.cookies?.AccessToken);
        if (!req.file) {
          return next( new AppError("No file uploaded", 400));
        }
        
    }
    catch (error) {
      return next(new AppError("Failed to add portfolio", 500));
    }
};
