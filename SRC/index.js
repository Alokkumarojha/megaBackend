// require('dotenv').config({path:"./env" })

import connectDB from "./db/index.js";


// dotenv.config({path:"./env" })



connectDB()
.then(()=> { 
    app.listen(process.env.PORT || 3000 ,()=> {
        console.log(`Server is running on port ${process.env.PORT }`);
    });
})
.catch((error)=> {
    console.log("Error connecting to MongoDB:", error);
})


/*
import express from "express";
const app = express();



( async () => {
    try {
        await mongoose.connect(`${process.env.MONGOODB_URI}/${DB_NAME}`)
        app.on(error => {
            console.log("Error connecting to MongoDB:", error);
        });

        app.listen(process.env.PORT, () =>{
            console.log(`Server is running on port ${process.env.PORT}`);
        })
        
        
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        throw error;
    }
}) ()

*/