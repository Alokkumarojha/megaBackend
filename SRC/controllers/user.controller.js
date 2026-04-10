import { asyncHandlers } from "../utils/asyncHandlers.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { User } from "../models/user.models.js";
import {
  upLoadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { upload } from "../middlewares/multer.middleware.js";

const registerUser = asyncHandlers(async (req, res) => {
  console.log("Inside registerUser — req.body:", req.body);
  console.log("Inside registerUser — req.files:", req.files);
  // check body exists first
  const { username, email, fullName, password } = req.body || {};
  console.log("Destructured fields:", username, email, fullName, password);

  // validation -- not empty
  if (
    !username ||
    !email ||
    !fullName ||
    !password ||
    [username, email, fullName, password].some((el) => el.trim() === "")
  ) {
    throw new ApiErrors("All fields are required", 400);
  }

  // check if user already exist
  const userExist = await User.findOne({ $or: [{ username }, { email }] });
  if (userExist) {
    console.log("User already exists");
    throw new ApiErrors("User already exists", 409);
  }

  // files from multer
  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  console.log("avatarLocalPath:", avatarLocalPath);

  let coverimageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverimageLocalPath = req.files.coverImage[0].path;

    console.log("coverimageLocalPath:", coverimageLocalPath);
  }
  if (!avatarLocalPath) {
    throw new ApiErrors("Avatar is required", 400);
  }

  // upload them to cloudinary
  const avatar = await upLoadOnCloudinary(avatarLocalPath);
  console.log("Cloudinary avatar response:", avatar);
  const coverimage = coverimageLocalPath
    ? await upLoadOnCloudinary(coverimageLocalPath)
    : null;

  if (!avatar) {
    throw new ApiErrors("Error uploading avatar", 500);
  }

  // create user object in DB
  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverimage: coverimage?.url || "",
    email,
    username: username.toLowerCase(),
    password,
  });
  console.log("User created (DB):", user);

  // exclude sensitive fields
  const createdUser = await User.findById(user._id).select(
    "-refreshToken -password",
  );
  console.log("CreatedUser to send:", createdUser);

  if (!createdUser) {
    throw new ApiErrors("Something went wrong while registering the user", 500);
  }

  // return response
  res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiErrors("Error generating refresh tokens", 500);
  }
};

const loginUser = asyncHandlers(async (req, res) => {
  // requst body se data lo
  // username or email
  // find the user
  // password check karo
  //access token and refresh token generate karo
  // send cookies
  const { email, username, password } = req.body;

  if (!username && !email) {
    throw new ApiErrors("Username or Email are required", 400);
  }
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (!user) {
    throw new ApiErrors("User not found", 404);
  }
  const isPasswordCorrect = await user.isPasswordCorrect(password);
  if (!isPasswordCorrect) {
    throw new ApiErrors("Invalid credentials", 401);
  }
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id,
  );

  const loggedInUser = await User.findOne(user._id).select(
    "-password -refreshToken",
  );

  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully",
      ),
    );
});

const logoutUser = asyncHandlers(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    { new: true },
  );
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccesstoken = asyncHandlers(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) {
    throw new ApiErrors("Unauthorized request", 401);
  }
  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    );
    const user = await User.findById(decodedToken._id);
    if (!user || user.refreshToken !== incomingRefreshToken) {
      throw new ApiErrors("Invalid refresh token", 401);
    }
    const options = {
      httpOnly: true,
      secure: true,
    };
    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshToken(user._id);
    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, newRefreshToken },
          "Access token refreshed successfully",
        ),
      );
  } catch (error) {
    throw new ApiErrors("Invalid refresh token", 401);
  }
});

const changeCurrentPassword = asyncHandlers(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // 1️⃣ validation
  if (!currentPassword || !newPassword) {
    throw new ApiErrors("Both fields are required", 400);
  }

  // 2️⃣ user find
  const user = await User.findById(req.user?._id);

  if (!user) {
    throw new ApiErrors("User not found", 404);
  }

  // 3️⃣ current password check
  const isPasswordCorrect = await user.isPasswordCorrect(currentPassword);

  if (!isPasswordCorrect) {
    throw new ApiErrors("Current password is incorrect", 401);
  }

  // 4️⃣ same password check
  if (currentPassword === newPassword) {
    throw new ApiErrors("New password cannot be same as old password", 400);
  }

  // 5️⃣ update password
  user.password = newPassword;

  // ✅ important (no validateBeforeSave false)
  await user.save();

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandlers(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandlers(async (req, res) => {
  const { fullName, email, username } = req.body;

  if (!fullName && !email && !username) {
    throw new ApiErrors("At least one field is required to update", 400);
  }

  // dynamic update object
  const updateFields = {};

  if (fullName) updateFields.fullName = fullName.trim();
  if (email) updateFields.email = email.trim().toLowerCase();
  if (username) updateFields.username = username.trim().toLowerCase();

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateFields },
    { new: true },
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandlers(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiErrors("Avatar image is required", 400);
  }

  // old user
  const oldImageToBeDeleted = await User.findById(req.user._id);

  if (!oldImageToBeDeleted) {
    throw new ApiErrors("User not found", 404);
  }

  // new upload
  const uploadedAvatar = await upLoadOnCloudinary(avatarLocalPath);

  if (!uploadedAvatar || !uploadedAvatar.url) {
    throw new ApiErrors("Error uploading avatar", 500);
  }

  // update DB
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { avatar: uploadedAvatar.url },
    { new: true },
  ).select("-password -refreshToken");

  // old delete using function ✅
  if (oldImageToBeDeleted?.avatar) {
    try {
      await deleteFromCloudinary(oldImageToBeDeleted.avatar);
    } catch (error) {
      console.log("Old avatar delete failed:", error.message);
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Avatar updated successfully"));
});

const updateUsercoverImage = asyncHandlers(async (req, res) => {
  const coverimageLocalPath = req.file?.path;

  if (!coverimageLocalPath) {
    throw new ApiErrors("Cover image is required", 400);
  }

  // old user
  const oldImageToBeDeleted = await User.findById(req.user._id);

  if (!oldImageToBeDeleted) {
    throw new ApiErrors("User not found", 404);
  }

  // upload new
  const uploadedCoverImage = await upLoadOnCloudinary(coverimageLocalPath);

  if (!uploadedCoverImage || !uploadedCoverImage.url) {
    throw new ApiErrors("Error uploading cover image", 500);
  }

  // update DB
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { coverimage: uploadedCoverImage.url },
    { new: true },
  ).select("-password -refreshToken");

  // delete old
  if (oldImageToBeDeleted?.coverimage) {
    try {
      await deleteFromCloudinary(oldImageToBeDeleted.coverimage);
    } catch (error) {
      console.log("Old cover image delete failed:", error.message);
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

const getUserChannelProfile = asyncHandlers(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiErrors("Username is required", 400);
  }

  const channel = await User.aggregate([
    {
      $match: { username: username.toLowerCase() },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: { $size: "$subscribers" },
        channelSubscribedToCount: { $size: "$subscribedTo" },
        isSubscribed: {
          $cond: {
            if: {
              $in: [req.user?._id, "$subscribers.subscriber"],
            },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverimage: 1,
        email: 1,
      },
    },
  ]);

  if (!channel || channel.length === 0) {
    throw new ApiErrors("Channel not found", 404);
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "Channel profile fetched successfully"),
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccesstoken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUsercoverImage,
  getUserChannelProfile,
};
