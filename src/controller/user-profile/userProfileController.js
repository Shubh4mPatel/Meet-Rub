
const AppError =require('../../../utils/appError');
const query=require('../../../config/dbConfig');
const{decodedToken}=require('../../../utils/helper');

const getUserProfile=async (req,res,next)=>{
    try{
        const user = decodedToken(req.cookies?.AccessToken);

        const {rows:userProfileInfo} = await query('select first_name,last_name,date_of_birth,phone_number,profile_title,gov_id_type,gov_id_url from freelancer where user_id=$1',[user.user_id]);

        if(userProfileInfo.length===0){
            return next(new AppError('User profile not found',404));
        }
        return res.status(200).json({
            status:'success',
            data:{
                userProfileInfo:userProfileInfo[0]
            }
        })

    }catch(error){
        return next(new AppError('Failed to get user profile',500));
    }
}

module.exports={getUserProfile};