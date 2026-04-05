import { v2 as cloudinary } from "cloudinary";
import fs from "fs";


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upLoadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    // Upload the file to Cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });

// Log the full response object to study its structure
    console.log("Cloudinary Upload Response:", JSON.stringify(response, null, 2));
    fs.unlinkSync(localFilePath);

    // file has been uploaded succsessfully
   // console.log("File is uploaded on cloudinary", response.url);
    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath); // remove the file from local storage
    console.error("Error uploading file to Cloudinary:", error);
    return null;
  }
};

export { upLoadOnCloudinary };
