const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const adminController = require("../controllers/admin");
const { isLoggedIn, isAdmin } = require("../middleware");

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

module.exports = router;
