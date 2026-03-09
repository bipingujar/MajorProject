const mongoose = require("mongoose");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/user");
const Listing = require("../models/listing");
const PaymentSettings = require("../models/paymentSettings");
const { cloudinary } = require("../cloudConfig");

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

module.exports.renderSignupform = (req, res) => {
    res.render("users/signup.ejs");
};

module.exports.signup = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const normalizedEmail = (email || "").trim().toLowerCase();

        if (!username || !normalizedEmail || !password) {
            req.flash("error", "Username, email, and password are required.");
            return res.redirect("/signup");
        }

        const transporter = createMailTransporter();
        if (!transporter) {
            req.flash("error", "Mail service is not configured. Please configure email first.");
            return res.redirect("/signup");
        }

        const verificationToken = crypto.randomBytes(32).toString("hex");
        const verificationTokenHash = crypto
            .createHash("sha256")
            .update(verificationToken)
            .digest("hex");

        const newUser = new User({
            email: normalizedEmail,
            username: String(username).trim(),
            isEmailVerified: false,
            emailVerificationTokenHash: verificationTokenHash,
            emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
        });

        const registeredUser = await User.register(newUser, password);
        const verifyUrl = `${req.protocol}://${req.get("host")}/verify-email/${verificationToken}`;
        const fromEmail =
            process.env.EMAIL_FROM ||
            process.env.SMTP_USER ||
            process.env.GMAIL_USER ||
            process.env.EMAIL_USER;

        try {
            await transporter.sendMail({
                from: fromEmail,
                to: registeredUser.email,
                subject: "Verify your Wanderstay account",
                text: `Welcome to Wanderstay! Verify your email by visiting this link: ${verifyUrl}. This link expires in 24 hours.`,
                html: `
                    <p>Welcome to Wanderstay!</p>
                    <p>Please verify your email by clicking the link below:</p>
                    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
                    <p>This verification link expires in 24 hours.</p>
                `,
            });
        } catch (mailErr) {
            await User.findByIdAndDelete(registeredUser._id);
            req.flash("error", "Unable to send verification email. Please try signing up again.");
            return res.redirect("/signup");
        }

        req.flash("success", "Signup successful. Check your email and verify your account before login.");
        return res.redirect("/login");
    } catch (e) {
        req.flash("error", e.message);
        return res.redirect("/signup");
    }
};

module.exports.renderLoginForm = (req, res) => {
    res.render("users/login.ejs");
};

module.exports.login = async (req, res) => {
    if (req.user && req.user.isEmailVerified === false) {
        return req.logout((err) => {
            if (err) {
                req.flash("error", "Unable to complete login.");
                return res.redirect("/login");
            }
            req.flash("error", "Please verify your email first. Check your inbox for the verification link.");
            return res.redirect("/login");
        });
    }

    req.flash("success", "Welcome back to Wanderstay!");
    const redirectUrl = res.locals.redirectUrl || "/listings";
    res.redirect(redirectUrl);
};

module.exports.verifyEmail = async (req, res) => {
    const token = String(req.params.token || "").trim();
    if (!token) {
        req.flash("error", "Invalid verification link.");
        return res.redirect("/login");
    }

    const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    const user = await User.findOne({
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
        req.flash("error", "Verification link is invalid or expired.");
        return res.redirect("/signup");
    }

    user.isEmailVerified = true;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    req.flash("success", "Email verified successfully. You can now log in.");
    return res.redirect("/login");
};

module.exports.logout = (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        req.flash("success", "You are logged out!");
        res.redirect("/listings");
    });
};

module.exports.renderProfile = async (req, res) => {
    const user = await User.findById(req.user._id).populate("wishlist");
    const wishlistIds = (user.wishlist || []).map((item) => item._id);

    const ownerListings = await Listing.find({ owner: req.user._id }).sort({ _id: -1 }).limit(12);

    const suggestedListings = await Listing.find({
        _id: { $nin: wishlistIds },
        owner: { $ne: req.user._id },
    }).limit(6);

    const paymentSettings = user.isAdmin ? await PaymentSettings.findOne({}) : null;

    res.render("users/profile.ejs", { user, suggestedListings, ownerListings, paymentSettings });
};

module.exports.updateFullName = async (req, res) => {
    const fullName = (req.body.fullName || "").trim();
    await User.findByIdAndUpdate(req.user._id, { fullName });
    req.flash("success", "Full name updated.");
    res.redirect("/profile");
};

module.exports.updateDateOfBirth = async (req, res) => {
    const dateOfBirth = req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null;
    if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) {
        req.flash("error", "Please enter a valid date of birth.");
        return res.redirect("/profile");
    }

    await User.findByIdAndUpdate(req.user._id, { dateOfBirth });
    req.flash("success", "Date of birth updated.");
    res.redirect("/profile");
};

module.exports.updateEmail = async (req, res) => {
    const email = (req.body.email || "").trim().toLowerCase();
    if (!email) {
        req.flash("error", "Email is required.");
        return res.redirect("/profile");
    }

    const existingUser = await User.findOne({
        email,
        _id: { $ne: req.user._id },
    });

    if (existingUser) {
        req.flash("error", "This email is already in use.");
        return res.redirect("/profile");
    }

    await User.findByIdAndUpdate(req.user._id, { email });
    req.flash("success", "Email updated.");
    res.redirect("/profile");
};

module.exports.updatePassword = async (req, res) => {
    const currentPassword = req.body.currentPassword || "";
    const newPassword = req.body.newPassword || "";
    const confirmNewPassword = req.body.confirmNewPassword || "";

    if (!currentPassword || !newPassword || !confirmNewPassword) {
        req.flash("error", "Please fill all password fields.");
        return res.redirect("/profile");
    }

    if (newPassword.trim().length < 6) {
        req.flash("error", "New password must be at least 6 characters.");
        return res.redirect("/profile");
    }

    if (newPassword !== confirmNewPassword) {
        req.flash("error", "New password and confirm password do not match.");
        return res.redirect("/profile");
    }

    if (currentPassword === newPassword) {
        req.flash("error", "New password must be different from current password.");
        return res.redirect("/profile");
    }

    const user = await User.findById(req.user._id);
    if (!user) {
        req.flash("error", "User not found.");
        return res.redirect("/profile");
    }

    try {
        await user.changePassword(currentPassword, newPassword);
        req.flash("success", "Password updated successfully.");
        return res.redirect("/profile");
    } catch (err) {
        req.flash("error", "Current password is incorrect.");
        return res.redirect("/profile");
    }
};

module.exports.updatePaymentSettingsFromProfile = async (req, res) => {
    const upiId = String(req.body?.payment?.upiId || "").trim();
    const qrFile = req.file;

    let paymentSettings = await PaymentSettings.findOne({});
    if (!paymentSettings) {
        paymentSettings = new PaymentSettings({});
    }

    const hasQrAfterUpdate = Boolean(qrFile || paymentSettings.qrImage?.url);
    if (!upiId && !hasQrAfterUpdate) {
        req.flash("error", "Add a UPI ID or upload a QR image.");
        return res.redirect("/profile");
    }

    paymentSettings.upiId = upiId;

    if (qrFile) {
        if (paymentSettings.qrImage?.filename) {
            try {
                await cloudinary.uploader.destroy(paymentSettings.qrImage.filename);
            } catch (err) {
                // Ignore cleanup failure and continue with new image save.
            }
        }

        paymentSettings.qrImage = {
            url: qrFile.path,
            filename: qrFile.filename,
        };
    }

    await paymentSettings.save();
    req.flash("success", "Payment settings updated successfully.");
    return res.redirect("/profile");
};

module.exports.addToWishlistFromProfile = async (req, res) => {
    const { listingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
        req.flash("error", "Invalid listing.");
        return res.redirect("/profile");
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/profile");
    }

    const user = await User.findById(req.user._id);
    user.wishlist = Array.isArray(user.wishlist) ? user.wishlist : [];
    const alreadyExists = user.wishlist.some((id) => id.equals(listing._id));
    if (!alreadyExists) {
        user.wishlist.push(listing._id);
        await user.save();
        req.flash("success", "Added to wishlist.");
    } else {
        req.flash("success", "Already in wishlist.");
    }
    res.redirect("/profile");
};

module.exports.removeFromWishlistFromProfile = async (req, res) => {
    const { listingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
        req.flash("error", "Invalid listing.");
        return res.redirect("/profile");
    }

    await User.findByIdAndUpdate(req.user._id, {
        $pull: { wishlist: listingId },
    });

    req.flash("success", "Removed from wishlist.");
    res.redirect("/profile");
};

module.exports.renderHelpCenter = (req, res) => {
    res.render("users/help-center.ejs");
};

module.exports.renderPrivacy = (req, res) => {
    res.render("users/privacy.ejs");
};

module.exports.renderTerms = (req, res) => {
    res.render("users/terms.ejs");
};

