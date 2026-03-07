const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const Listing = require("../models/listing.js");
const {isLoggedIn, isOwner, validateListing} = require("../middleware.js");
const listingController = require("../controllers/listings.js");
const multer  = require('multer')
const {storage} = require("../cloudConfig.js");
const upload = multer({
    storage,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB per image
    },
});

const listingImagesUploadMiddleware = upload.fields([
    { name: "listing[images]", maxCount: 10 },
    { name: "listing[images][]", maxCount: 10 },
    { name: "listing[image]", maxCount: 10 },
]);

const listingImagesUpload = (req, res, next) => {
    listingImagesUploadMiddleware(req, res, (err) => {
        if (err) return next(err);
        return next();
    });
};


router.route("/")
.get(wrapAsync(listingController.index))
.post(
    isLoggedIn,
    listingImagesUpload,
    validateListing,
    wrapAsync(listingController.createListing),
);

router.post(
    "/chatbot/ask",
    wrapAsync(listingController.askChatbot)
);


// New Route
router.get("/new", isLoggedIn, listingController.renderNewForm);

router.route("/:id")
.get(wrapAsync(listingController.showListing))
.put(
    isLoggedIn,
    isOwner,
    listingImagesUpload,
    validateListing,
    wrapAsync(listingController.updateListing))
.delete(
    isLoggedIn,
    isOwner,
    wrapAsync(listingController.destroyListing));

router.post(
    "/:id/wishlist",
    isLoggedIn,
    wrapAsync(listingController.toggleWishlist)
);

router.get(
    "/:id/photos",
    wrapAsync(listingController.showListingPhotos)
);

router.get(
    "/:id/availability",
    wrapAsync(listingController.checkAvailability)
);

router.get(
    "/:id/payment",
    isLoggedIn,
    wrapAsync(listingController.renderPaymentPage)
);

router.post(
    "/:id/payment/order",
    isLoggedIn,
    wrapAsync(listingController.createPaymentOrder)
);

router.post(
    "/:id/reserve",
    isLoggedIn,
    wrapAsync(listingController.reserveListing)
);


// Edit Route
router.get(
    "/:id/edit",
    isLoggedIn, 
    isOwner,
    wrapAsync(listingController.renderEditForm));

module.exports = router;
