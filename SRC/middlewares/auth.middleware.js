import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandlers } from "../utils/asyncHandlers.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.models.js";



 export const verifyJWT = asyncHandlers(async (req , _ , next) => {
    try {
        const token= req.cookies?.accessToken || 
        req.headers("Authorization")?.replace("Bearer ","")
        if(!token){
            throw new ApiErrors("Unauthorized access, token missing",401);
        }
    
       const decodedToken= jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
       const user = await User.findById(decodedToken?._id).select("-password -refreshToken");
        if(!user){
            // todo discuss about frontend
            throw new ApiErrors("Unauthorized access, user not found",401);
        }
        req.user= user;
        next();
    } catch (error) {
        throw new ApiErrors(error?.message || "Unauthorized access, invalid token",401);
        
    }
 });
