const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const adminController = require("../controllers/admin");
const { isLoggedIn, isAdmin } = require("../middleware");
const multer = require("multer");
const { storage } = require("../cloudConfig");

const upload = multer({
    storage,
    limits: {
        fileSize: 2 * 1024 * 1024,
    },
});

router.get(
    "/payments",
    isLoggedIn,
    isAdmin,
    wrapAsync(adminController.renderPaymentsDashboard)
);

router.post(
    "/payments/:listingId/:bookingId",
    isLoggedIn,
    isAdmin,
    wrapAsync(adminController.updatePaymentDetails)
);

router.post(
    "/payments/settings",
    isLoggedIn,
    isAdmin,
    upload.single("payment[qrImage]"),
    wrapAsync(adminController.updatePaymentSettings)
);

module.exports = router;
