if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const { MongoStore } = require(`connect-mongo`);
//const MongoStore = require('connect-mongo');
const flash = require("connect-flash");
const passport = require("passport");
const multer = require("multer");

// app.use(session(sessionConfig));
// app.use(passport.initialize());
// app.use(passport.session());

// Passport strategy
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");

const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");
const adminRouter = require("./routes/admin.js");

const dbUrl = process.env.ATLASDB_URL || process.env.MONGO_URL;

if (!dbUrl) {
    throw new Error("Missing DB URL. Set ATLASDB_URL (or MONGO_URL) in environment variables.");
}

async function connectDB() {
    await mongoose.connect(dbUrl, {
        serverSelectionTimeoutMS: 10000,
    });
    console.log("Connected to DB");
}

// Middleware setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "/public")));

const store = new MongoStore({
    mongoUrl: dbUrl,
    crypto: {
        secret: process.env.SECRET,
    },
    touchAfter: 24 * 3600,
});

store.on("error", (err) => {
    console.log("ERROR in MONGO SESSION STORE", err);
});

const sessionOptions = {
    store,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    },
};
// Root route
// app.get("/", (req, res) => {
//     res.send("Hi, I am root");
// });


app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currUser = req.user;
    next();
});

// app.get("/demouser", async (req, res) => {
//     let fakeUser = new User({
//         email: "umesh@gmail.com",
//         username: "gujar-student",
//     });

//     let registerdUser = await User.register(fakeUser, "helloworld");
//     res.send(registerdUser);
// });

app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);
app.use("/admin", adminRouter);

// Catch-all (404)
app.use((req, res, next) => {
    next(new ExpressError(404, "Page Not Found!"));
});

// Error handler
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        req.flash("error", "Each image must be 2MB or smaller.");
        return res.redirect("back");
    }

    let { statusCode = 500, message = "Something went wrong!" } = err;
    res.status(statusCode).render("error", { err });
    // OR if you don't have error.ejs yet:
    // res.status(statusCode).send(message);
});

const PORT = process.env.PORT || 8080;

async function startServer() {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`Server is listening on port ${PORT}`);
        });
    } catch (err) {
        console.error("DB Connection Error:", err.message);
        process.exit(1);
    }
}

startServer();
