const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const passport = require("passport");
const nodemailer = require("nodemailer");

const User = require("../models/user.js");
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn, isAdmin, saveRedirectUrl } = require("../middleware.js");
const userController = require("../controllers/users.js");
const multer = require("multer");
const { storage } = require("../cloudConfig");

const upload = multer({
    storage,
    limits: {
        fileSize: 2 * 1024 * 1024,
    },
});

const createMailTransporter = () => {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

    if (smtpHost && smtpUser && smtpPass) {
        return nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: process.env.SMTP_SECURE === "true" || smtpPort === 465,
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });
    }

    const gmailUser = process.env.GMAIL_USER || smtpUser;
    const gmailPass = process.env.GMAIL_APP_PASSWORD || smtpPass;
    if (gmailUser && gmailPass) {
        return nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: gmailUser,
                pass: gmailPass,
            },
        });
    }

    return null;
};

router
    .route("/signup")
    .get(userController.renderSignupform)
    .post(wrapAsync(userController.signup));

router.get("/verify-email/:token", wrapAsync(userController.verifyEmail));

router
    .route("/login")
    .get(userController.renderLoginForm)
    .post(
        saveRedirectUrl,
        passport.authenticate("local", {
            failureRedirect: "/login",
            failureFlash: true,
        }),
        userController.login
    );

router.get("/logout", userController.logout);
router.get("/profile", isLoggedIn, wrapAsync(userController.renderProfile));
router.post("/profile/full-name", isLoggedIn, wrapAsync(userController.updateFullName));
router.post("/profile/date-of-birth", isLoggedIn, wrapAsync(userController.updateDateOfBirth));
router.post("/profile/email", isLoggedIn, wrapAsync(userController.updateEmail));
router.post("/profile/password", isLoggedIn, wrapAsync(userController.updatePassword));
router.post(
    "/profile/payment-settings",
    isLoggedIn,
    isAdmin,
    upload.single("payment[qrImage]"),
    wrapAsync(userController.updatePaymentSettingsFromProfile)
);
router.post(
    "/profile/wishlist/:listingId/add",
    isLoggedIn,
    wrapAsync(userController.addToWishlistFromProfile)
);
router.post(
    "/profile/wishlist/:listingId/remove",
    isLoggedIn,
    wrapAsync(userController.removeFromWishlistFromProfile)
);
router.get("/help-center", userController.renderHelpCenter);
router.get("/privacy", userController.renderPrivacy);
router.get("/terms", userController.renderTerms);

router.get("/forgot-password", (req, res) => {
    res.render("users/forgot-password.ejs");
});

router.post(
    "/forgot-password",
    wrapAsync(async (req, res) => {
        const { email } = req.body;
        const normalizedEmail = (email || "").trim().toLowerCase();

        if (!normalizedEmail) {
            req.flash("error", "Please enter your registered email.");
            return res.redirect("/forgot-password");
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            req.flash("error", "No account found with that email.");
            return res.redirect("/forgot-password");
        }

        const transporter = createMailTransporter();

        const otp = String(crypto.randomInt(100000, 1000000));
        const hashedOtp = crypto
            .createHash("sha256")
            .update(otp)
            .digest("hex");

        user.resetPasswordOtpHash = hashedOtp;
        user.resetPasswordOtpExpires = Date.now() + 10 * 60 * 1000;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        if (!transporter) {
            user.resetPasswordOtpHash = undefined;
            user.resetPasswordOtpExpires = undefined;
            await user.save();
            req.flash("error", "Mail service is not configured. Please configure email first.");
            return res.redirect("/forgot-password");
        }

        const fromEmail =
            process.env.EMAIL_FROM ||
            process.env.SMTP_USER ||
            process.env.GMAIL_USER ||
            process.env.EMAIL_USER;
        const mailOptions = {
            from: fromEmail,
            to: user.email,
            subject: "Wanderstay Password Reset OTP",
            text: `Your Wanderstay password reset OTP is ${otp}. It expires in 10 minutes.`,
            html: `
                <p>You requested a password reset.</p>
                <p>Your OTP is:</p>
                <h2 style="letter-spacing:2px;">${otp}</h2>
                <p>This OTP expires in 10 minutes.</p>
                <p>If you did not request this, you can ignore this email.</p>
            `,
        };

        try {
            await transporter.sendMail(mailOptions);
            req.session.passwordResetEmail = normalizedEmail;
            req.flash("success", "OTP sent to your email.");
            return res.redirect("/reset-password/otp");
        } catch (mailErr) {
            user.resetPasswordOtpHash = undefined;
            user.resetPasswordOtpExpires = undefined;
            await user.save();
            req.flash("error", "Unable to send OTP email right now. Please try again.");
            return res.redirect("/forgot-password");
        }
    })
);

router.get("/reset-password/otp", (req, res) => {
    if (!req.session.passwordResetEmail) {
        req.flash("error", "Please request OTP first.");
        return res.redirect("/forgot-password");
    }

    return res.render("users/reset-otp.ejs", { email: req.session.passwordResetEmail });
});

router.post(
    "/reset-password/otp",
    wrapAsync(async (req, res) => {
        const email = req.session.passwordResetEmail;
        const { otp, password, confirmPassword } = req.body;

        if (!email) {
            req.flash("error", "Session expired. Request OTP again.");
            return res.redirect("/forgot-password");
        }

        if (!otp || !/^[0-9]{6}$/.test(String(otp).trim())) {
            req.flash("error", "Please enter a valid 6-digit OTP.");
            return res.redirect("/reset-password/otp");
        }

        if (!password || password.trim().length < 6) {
            req.flash("error", "Password must be at least 6 characters.");
            return res.redirect("/reset-password/otp");
        }

        if (password !== confirmPassword) {
            req.flash("error", "Passwords do not match.");
            return res.redirect("/reset-password/otp");
        }

        const hashedOtp = crypto
            .createHash("sha256")
            .update(String(otp).trim())
            .digest("hex");

        const user = await User.findOne({
            email,
            resetPasswordOtpHash: hashedOtp,
            resetPasswordOtpExpires: { $gt: Date.now() },
        });

        if (!user) {
            req.flash("error", "Invalid or expired OTP.");
            return res.redirect("/reset-password/otp");
        }

        await user.setPassword(password);
        user.resetPasswordOtpHash = undefined;
        user.resetPasswordOtpExpires = undefined;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        delete req.session.passwordResetEmail;
        req.flash("success", "Password updated successfully.");
        return res.redirect("/login");
    })
);

router.get(
    "/reset-password/:token",
    wrapAsync(async (req, res) => {
        const hashedToken = crypto
            .createHash("sha256")
            .update(req.params.token)
            .digest("hex");

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            req.flash("error", "Token is invalid or expired.");
            return res.redirect("/forgot-password");
        }

        return res.render("users/reset.ejs", { token: req.params.token });
    })
);

router.post(
    "/reset-password/:token",
    wrapAsync(async (req, res) => {
        const { password, confirmPassword } = req.body;

        if (!password || password.trim().length < 6) {
            req.flash("error", "Password must be at least 6 characters.");
            return res.redirect(`/reset-password/${req.params.token}`);
        }

        if (password !== confirmPassword) {
            req.flash("error", "Passwords do not match.");
            return res.redirect(`/reset-password/${req.params.token}`);
        }

        const hashedToken = crypto
            .createHash("sha256")
            .update(req.params.token)
            .digest("hex");

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            req.flash("error", "Token is invalid or expired.");
            return res.redirect("/forgot-password");
        }

        await user.setPassword(password);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        req.flash("success", "Password updated successfully.");
        return res.redirect("/login");
    })
);

module.exports = router;

