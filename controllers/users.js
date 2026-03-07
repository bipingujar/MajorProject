const mongoose = require("mongoose");
const User = require("../models/user");
const Listing = require("../models/listing");

module.exports.renderSignupform = (req, res) => {
    res.render("users/signup.ejs");
};

module.exports.signup = async (req, res, next) => {
    try {
        const { username, email, password } = req.body;
        const normalizedEmail = (email || "").trim().toLowerCase();
        const newUser = new User({ email: normalizedEmail, username });
        const registerdUser = await User.register(newUser, password);

        req.login(registerdUser, (err) => {
            if (err) {
                return next(err);
            }
            req.flash("success", "Welcome to Wanderstay!");
            res.redirect("/listings");
        });
    } catch (e) {
        req.flash("error", e.message);
        res.redirect("/signup");
    }
};

module.exports.renderLoginForm = (req, res) => {
    res.render("users/login.ejs");
};

module.exports.login = async (req, res) => {
    req.flash("success", "Welcome back to Wanderstay!");
    const redirectUrl = res.locals.redirectUrl || "/listings";
    res.redirect(redirectUrl);
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

    res.render("users/profile.ejs", { user, suggestedListings, ownerListings });
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

