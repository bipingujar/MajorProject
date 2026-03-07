const Listing = require("../models/listing");
const User = require("../models/user");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const crypto = require("crypto");
const https = require("https");

const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken });

const CATEGORY_VALUES = [
    "rooms",
    "iconic-cities",
    "mountains",
    "castles",
    "arctic",
    "camping",
    "farms",
    "domes",
    "boats",
];

const AMENITY_KEYS = [
    "kitchen",
    "wifi",
    "freeParking",
    "pool",
    "sharedSauna",
    "tv",
    "lift",
    "washingMachine",
    "dryer",
    "securityCameras",
];

const PAYMENT_METHODS = ["upi", "card", "netbanking", "wallet"];

const mapRazorpayMethod = (method = "") => {
    if (method === "netbanking") return "netbanking";
    if (method === "upi") return "upi";
    if (method === "card") return "card";
    if (method === "wallet") return "wallet";
    return "";
};

const calculateBookingAmount = (listingPrice, checkIn, checkOut) => {
    const millisecondsInDay = 1000 * 60 * 60 * 24;
    const nights = Math.max(
        1,
        Math.round((checkOut.getTime() - checkIn.getTime()) / millisecondsInDay)
    );
    const nightlyPrice = Math.max(Number(listingPrice) || 0, 0);
    const totalInr = nights * nightlyPrice;
    const amountPaise = Math.round(totalInr * 100);
    return { nights, totalInr, amountPaise };
};

const getRazorpayAuthHeader = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return null;
    const encoded = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    return `Basic ${encoded}`;
};

const razorpayRequest = (method, path, payload = null) => {
    const authHeader = getRazorpayAuthHeader();
    if (!authHeader) {
        return Promise.reject(new Error("Payment gateway is not configured."));
    }

    const bodyString = payload ? JSON.stringify(payload) : "";

    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: "api.razorpay.com",
                path,
                method,
                headers: {
                    Authorization: authHeader,
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(bodyString),
                },
            },
            (response) => {
                let data = "";
                response.on("data", (chunk) => {
                    data += chunk;
                });
                response.on("end", () => {
                    let parsed;
                    try {
                        parsed = data ? JSON.parse(data) : {};
                    } catch (err) {
                        return reject(new Error("Invalid response from payment gateway."));
                    }

                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        return resolve(parsed);
                    }

                    return reject(
                        new Error(parsed.error?.description || "Unable to process payment request.")
                    );
                });
            }
        );

        req.on("error", () => reject(new Error("Unable to reach payment gateway.")));
        if (bodyString) {
            req.write(bodyString);
        }
        req.end();
    });
};

const createRazorpayOrder = async ({ amountPaise, receipt, notes = {} }) => {
    return razorpayRequest("POST", "/v1/orders", {
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes,
    });
};

const fetchRazorpayPayment = async (paymentId) => {
    return razorpayRequest("GET", `/v1/payments/${paymentId}`);
};

const escapeRegExp = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeAmenities = (rawAmenities = {}) => {
    const normalized = {};
    for (let key of AMENITY_KEYS) {
        const value = rawAmenities[key];
        normalized[key] =
            value === true ||
            value === "true" ||
            value === "on" ||
            value === "yes" ||
            value === 1 ||
            value === "1";
    }
    return normalized;
};

const getUploadedImages = (req) => {
    if (req.files && !Array.isArray(req.files)) {
        const byImages = req.files["listing[images]"] || [];
        const byImagesArray = req.files["listing[images][]"] || [];
        const byLegacyImage = req.files["listing[image]"] || [];
        return [...byImages, ...byImagesArray, ...byLegacyImage].slice(0, 10);
    }

    if (Array.isArray(req.files)) {
        return req.files.slice(0, 10);
    }

    if (req.file) {
        return [req.file];
    }

    return [];
};

const parseDateRange = (checkInRaw, checkOutRaw) => {
    const checkIn = new Date(checkInRaw);
    const checkOut = new Date(checkOutRaw);

    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
        return { error: "Please select valid check-in and checkout dates." };
    }

    if (checkOut <= checkIn) {
        return { error: "Checkout must be after check-in." };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    checkIn.setHours(0, 0, 0, 0);
    checkOut.setHours(0, 0, 0, 0);

    if (checkIn < today) {
        return { error: "Check-in date cannot be in the past." };
    }

    return { checkIn, checkOut };
};

const hasOverlap = (bookings = [], checkIn, checkOut) => {
    return bookings.some((booking) => {
        const bookedIn = new Date(booking.checkIn);
        const bookedOut = new Date(booking.checkOut);
        return checkIn < bookedOut && checkOut > bookedIn;
    });
};

const buildChatbotAnswer = async (questionRaw = "") => {
    const question = String(questionRaw || "").trim();
    const normalizedQuestion = question.toLowerCase();

    if (!question) {
        return {
            answer: "Please type your question so I can help.",
            suggestions: [],
        };
    }

    if (/(hello|hi|hey|namaste|good morning|good evening)/i.test(normalizedQuestion)) {
        return {
            answer:
                "Hi! I can help with booking, payments, account, wishlist, and finding stays by location.",
            suggestions: [],
        };
    }

    if (/(book|reserve|reservation|checkout|check[- ]?in|check[- ]?out)/i.test(normalizedQuestion)) {
        return {
            answer:
                "To reserve a stay: open a listing, choose check-in/check-out and guests, click Check Availability, then complete payment to confirm booking.",
            suggestions: [],
        };
    }

    if (/(payment|razorpay|upi|card|wallet|netbanking|refund)/i.test(normalizedQuestion)) {
        return {
            answer:
                "Supported payment methods are UPI, Card, Netbanking, and Wallet. Payment is verified before reservation is confirmed.",
            suggestions: [],
        };
    }

    if (/(login|sign in|signup|sign up|register|account)/i.test(normalizedQuestion)) {
        return {
            answer:
                "Use Sign Up to create an account, then Login. If needed, use Forgot Password on the login page to reset access.",
            suggestions: [],
        };
    }

    if (/(wishlist|favorite|favourite|save)/i.test(normalizedQuestion)) {
        return {
            answer:
                "You can add listings to Wishlist from listing pages and manage them later from your Profile.",
            suggestions: [],
        };
    }

    if (/(host|create listing|add listing|post listing|become host)/i.test(normalizedQuestion)) {
        return {
            answer:
                "To host, log in and open 'Add New Listing'. Fill details, upload photos, and publish your property.",
            suggestions: [],
        };
    }

    if (/(help|support|contact|privacy|terms)/i.test(normalizedQuestion)) {
        return {
            answer:
                "You can open Help Center, Privacy, and Terms from the navigation area for detailed support and policies.",
            suggestions: [],
        };
    }

    const match = normalizedQuestion.match(
        /(?:in|at|near)\s+([a-zA-Z][a-zA-Z\s-]{1,40})$|(?:find|show|search)\s+([a-zA-Z][a-zA-Z\s-]{1,40})/
    );

    const locationTerm = (match?.[1] || match?.[2] || "").trim();

    if (locationTerm.length >= 2) {
        const regex = new RegExp(escapeRegExp(locationTerm), "i");
        const listings = await Listing.find({
            $or: [{ location: regex }, { country: regex }, { title: regex }],
        })
            .select("title location country price")
            .limit(5);

        if (listings.length) {
            return {
                answer: `I found ${listings.length} stay option(s) matching "${locationTerm}".`,
                suggestions: listings.map((listing) => ({
                    title: listing.title,
                    subtitle: `${listing.location}, ${listing.country} - INR ${listing.price}/night`,
                    url: `/listings/${listing._id}`,
                })),
            };
        }
    }

    return {
        answer:
            "I could not fully understand that yet. Try asking about booking, payment, wishlist, account, or ask like 'find stays in Goa'.",
        suggestions: [],
    };
};

module.exports.index = async (req, res) => {
    const searchQuery = (req.query.q || "").trim();
    const requestedCategory = (req.query.category || "").trim().toLowerCase();
    const activeCategory = requestedCategory === "trending"
        ? "trending"
        : (CATEGORY_VALUES.includes(requestedCategory) ? requestedCategory : "");

    const matchConditions = {};
    if (searchQuery) {
        const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escapedQuery, "i");
        matchConditions.$or = [
            { title: regex },
            { location: regex },
            { country: regex },
            { description: regex },
        ];
    }

    let allListings;

    if (activeCategory === "trending") {
        const pipeline = [];

        if (Object.keys(matchConditions).length) {
            pipeline.push({ $match: matchConditions });
        }

        pipeline.push(
            {
                $lookup: {
                    from: "reviews",
                    localField: "reviews",
                    foreignField: "_id",
                    as: "reviewDocs",
                },
            },
            {
                $addFields: {
                    avgRating: { $ifNull: [{ $avg: "$reviewDocs.rating" }, 0] },
                    reviewsCount: { $size: "$reviewDocs" },
                },
            },
            { $sort: { avgRating: -1, reviewsCount: -1, _id: -1 } },
            { $project: { reviewDocs: 0 } }
        );

        allListings = await Listing.aggregate(pipeline);
    } else {
        if (activeCategory) {
            matchConditions.category = activeCategory;
        }
        allListings = await Listing.find(matchConditions);
    }

    res.render("listings/index.ejs", {
        allListings,
        searchQuery,
        activeCategory,
    });
};

module.exports.askChatbot = async (req, res) => {
    const question = (req.body?.question || "").trim();

    if (!question) {
        return res.status(400).json({
            success: false,
            message: "Question is required.",
        });
    }

    const reply = await buildChatbotAnswer(question);
    return res.json({
        success: true,
        answer: reply.answer,
        suggestions: reply.suggestions || [],
    });
};

module.exports.renderNewForm = (req, res) => {
    res.render("listings/new.ejs");
};

module.exports.showListing = async (req, res) => {
    const { id } = req.params;

    const listing = await Listing.findById(id)
        .populate("owner")
        .populate({
            path: "reviews",
            populate: { path: "author" },
        });

    if (!listing) {
        req.flash("error", "Listing not found!");
        return res.redirect("/listings");
    }

    const isWishlisted = req.user
        ? Array.isArray(req.user.wishlist) &&
          req.user.wishlist.some((wishlistId) => wishlistId.equals(listing._id))
        : false;

    res.render("listings/show", {
        listing,
        mapToken: process.env.MAP_TOKEN,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
        isWishlisted,
    });
};

module.exports.showListingPhotos = async (req, res) => {
    const { id } = req.params;
    const requestedIndex = parseInt(req.query.index, 10);

    const listing = await Listing.findById(id).populate("owner");
    if (!listing) {
        req.flash("error", "Listing not found!");
        return res.redirect("/listings");
    }

    const listingImages = (listing.images && listing.images.length)
        ? listing.images
        : (listing.image ? [listing.image] : []);

    if (!listingImages.length) {
        req.flash("error", "No photos available for this listing.");
        return res.redirect(`/listings/${id}`);
    }

    const safeIndex = Number.isInteger(requestedIndex)
        ? Math.min(Math.max(requestedIndex, 0), listingImages.length - 1)
        : 0;

    return res.render("listings/photos.ejs", {
        listing,
        listingImages,
        activeIndex: safeIndex,
    });
};

module.exports.toggleWishlist = async (req, res) => {
    const { id } = req.params;

    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing not found!");
        return res.redirect("/listings");
    }

    const user = await User.findById(req.user._id);
    user.wishlist = Array.isArray(user.wishlist) ? user.wishlist : [];
    const existingIndex = user.wishlist.findIndex((listingId) => listingId.equals(listing._id));
    const wasWishlisted = existingIndex !== -1;

    if (wasWishlisted) {
        user.wishlist.splice(existingIndex, 1);
    } else {
        user.wishlist.push(listing._id);
    }
    await user.save();

    const isAjaxRequest =
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json"));

    if (isAjaxRequest) {
        return res.json({
            success: true,
            wishlisted: !wasWishlisted,
            message: wasWishlisted ? "Removed from wishlist." : "Added to wishlist.",
        });
    }

    req.flash("success", wasWishlisted ? "Removed from wishlist." : "Added to wishlist.");
    return res.redirect(`/listings/${id}`);
};

module.exports.checkAvailability = async (req, res) => {
    const { id } = req.params;
    const { checkIn: checkInRaw, checkOut: checkOutRaw } = req.query;

    const parsed = parseDateRange(checkInRaw, checkOutRaw);
    if (parsed.error) {
        return res.status(400).json({
            available: false,
            message: parsed.error,
        });
    }

    const listing = await Listing.findById(id).select("bookings");
    if (!listing) {
        return res.status(404).json({
            available: false,
            message: "Listing not found.",
        });
    }

    const isAvailable = !hasOverlap(listing.bookings, parsed.checkIn, parsed.checkOut);
    return res.json({
        available: isAvailable,
        message: isAvailable
            ? "Room is available for selected dates."
            : "Room is not available for selected dates.",
    });
};

module.exports.renderPaymentPage = async (req, res) => {
    const { id } = req.params;
    const { checkIn: checkInRaw, checkOut: checkOutRaw, guests } = req.query;

    const parsed = parseDateRange(checkInRaw, checkOutRaw);
    if (parsed.error) {
        req.flash("error", parsed.error);
        return res.redirect(`/listings/${id}`);
    }

    const listing = await Listing.findById(id).select("title price bookings");
    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    if (hasOverlap(listing.bookings, parsed.checkIn, parsed.checkOut)) {
        req.flash("error", "Selected dates are no longer available.");
        return res.redirect(`/listings/${id}`);
    }

    const guestsCount = Math.max(parseInt(guests, 10) || 1, 1);
    const { nights, totalInr, amountPaise } = calculateBookingAmount(
        listing.price,
        parsed.checkIn,
        parsed.checkOut
    );

    return res.render("listings/payment.ejs", {
        listing,
        booking: {
            checkIn: checkInRaw,
            checkOut: checkOutRaw,
            guests: guestsCount,
            nights,
            totalInr,
            amountPaise,
        },
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
    });
};

module.exports.createPaymentOrder = async (req, res) => {
    const { id } = req.params;
    const bookingBody = req.body.booking || {};
    const { checkIn: checkInRaw, checkOut: checkOutRaw } = bookingBody;
    const paymentMethod = (bookingBody.paymentMethod || "").toLowerCase();

    const parsed = parseDateRange(checkInRaw, checkOutRaw);
    if (parsed.error) {
        return res.status(400).json({
            success: false,
            message: parsed.error,
        });
    }

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
        return res.status(400).json({
            success: false,
            message: "Please select a valid payment method.",
        });
    }

    const listing = await Listing.findById(id).select("title price bookings");
    if (!listing) {
        return res.status(404).json({
            success: false,
            message: "Listing not found.",
        });
    }

    if (hasOverlap(listing.bookings, parsed.checkIn, parsed.checkOut)) {
        return res.status(409).json({
            success: false,
            message: "Selected dates are no longer available.",
        });
    }

    const { amountPaise, nights } = calculateBookingAmount(listing.price, parsed.checkIn, parsed.checkOut);
    if (amountPaise <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid booking amount.",
        });
    }

    const receipt = `rcpt_${id}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const order = await createRazorpayOrder({
        amountPaise,
        receipt,
        notes: {
            listingId: String(id),
            userId: String(req.user._id),
            paymentMethod,
            nights: String(nights),
        },
    });

    return res.json({
        success: true,
        keyId: process.env.RAZORPAY_KEY_ID || "",
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        description: `Reservation for ${listing.title}`,
    });
};

module.exports.reserveListing = async (req, res) => {
    const { id } = req.params;
    const bookingBody = req.body.booking || {};
    const paymentBody = req.body.payment || {};
    const { checkIn: checkInRaw, checkOut: checkOutRaw, guests } = bookingBody;
    const paymentMethod = (bookingBody.paymentMethod || "").toLowerCase();
    const paymentOrderId = paymentBody.orderId || "";
    const paymentId = paymentBody.paymentId || "";
    const paymentSignature = paymentBody.signature || "";

    const parsed = parseDateRange(checkInRaw, checkOutRaw);
    if (parsed.error) {
        req.flash("error", parsed.error);
        return res.redirect(`/listings/${id}`);
    }

    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    if (hasOverlap(listing.bookings, parsed.checkIn, parsed.checkOut)) {
        req.flash("error", "Selected dates are no longer available.");
        return res.redirect(`/listings/${id}`);
    }

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
        req.flash("error", "Please select a valid payment method.");
        return res.redirect(`/listings/${id}`);
    }

    if (!paymentOrderId || !paymentId || !paymentSignature) {
        req.flash("error", "Please complete payment authentication before reserving.");
        return res.redirect(`/listings/${id}`);
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
        req.flash("error", "Payment gateway is not configured.");
        return res.redirect(`/listings/${id}`);
    }

    const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(`${paymentOrderId}|${paymentId}`)
        .digest("hex");

    if (expectedSignature !== paymentSignature) {
        req.flash("error", "Payment authentication failed.");
        return res.redirect(`/listings/${id}`);
    }

    const { amountPaise } = calculateBookingAmount(listing.price, parsed.checkIn, parsed.checkOut);
    let verifiedPayment;
    try {
        verifiedPayment = await fetchRazorpayPayment(paymentId);
    } catch (err) {
        req.flash("error", err.message || "Unable to verify payment.");
        return res.redirect(`/listings/${id}`);
    }

    if (verifiedPayment.order_id !== paymentOrderId) {
        req.flash("error", "Payment order mismatch.");
        return res.redirect(`/listings/${id}`);
    }

    if (!["captured", "authorized"].includes(verifiedPayment.status)) {
        req.flash("error", "Payment is not completed.");
        return res.redirect(`/listings/${id}`);
    }

    if (Number(verifiedPayment.amount) !== amountPaise) {
        req.flash("error", "Payment amount mismatch.");
        return res.redirect(`/listings/${id}`);
    }

    const verifiedMethod = mapRazorpayMethod(verifiedPayment.method);
    if (!verifiedMethod || verifiedMethod !== paymentMethod) {
        req.flash("error", "Selected payment method does not match verified payment.");
        return res.redirect(`/listings/${id}`);
    }

    const guestsCount = Math.max(parseInt(guests, 10) || 1, 1);
    listing.bookings.push({
        guest: req.user._id,
        checkIn: parsed.checkIn,
        checkOut: parsed.checkOut,
        guests: guestsCount,
        paymentMethod,
        paymentOrderId,
        paymentId,
        paymentAmountPaise: amountPaise,
        paymentStatus: verifiedPayment.status,
    });
    await listing.save();

    req.flash("success", "Payment verified and reservation created successfully.");
    return res.redirect(`/listings/${id}`);
};

module.exports.createListing = async (req, res) => {
    const uploadedFiles = getUploadedImages(req);
    if (!uploadedFiles.length) {
        req.flash("error", "Please upload at least 1 image.");
        return res.redirect("/listings/new");
    }

    const response = await geocodingClient
        .forwardGeocode({
            query: req.body.listing.location,
            limit: 1,
        })
        .send();

    const listingData = {
        ...req.body.listing,
        amenities: normalizeAmenities(req.body.listing?.amenities),
    };
    const newListing = new Listing(listingData);
    newListing.owner = req.user._id;
    newListing.images = uploadedFiles.map((file) => ({
        url: file.path,
        filename: file.filename,
    }));

    newListing.image = newListing.images[0];
    newListing.geometry = response.body.features[0].geometry;

    await newListing.save();
    req.flash("success", "New Listing Created!");
    res.redirect("/listings");
};

module.exports.renderEditForm = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing you requested for does not exist!");
        return res.redirect("/listings");
    }

    const existingImages = (listing.images && listing.images.length)
        ? listing.images
        : (listing.image ? [listing.image] : []);

    const originalImageUrls = existingImages.map((img) =>
        img.url.replace("/upload", "/upload/w_250")
    );

    return res.render("listings/edit.ejs", { listing, originalImageUrls });
};

module.exports.updateListing = async (req, res) => {
    const { id } = req.params;
    const listingData = {
        ...req.body.listing,
        amenities: normalizeAmenities(req.body.listing?.amenities),
    };
    const listing = await Listing.findByIdAndUpdate(id, listingData);

    const uploadedFiles = getUploadedImages(req);
    if (uploadedFiles.length > 0) {
        const newImages = uploadedFiles.map((file) => ({
            url: file.path,
            filename: file.filename,
        }));

        const existingImages = (listing.images && listing.images.length)
            ? listing.images
            : (listing.image ? [listing.image] : []);

        listing.images = [...existingImages, ...newImages].slice(0, 10);
        listing.image = listing.images[0];
        await listing.save();
    }

    req.flash("success", "Listing Updated!");
    res.redirect(`/listings/${id}`);
};

module.exports.destroyListing = async (req, res) => {
    const { id } = req.params;
    await Listing.findByIdAndDelete(id);
    req.flash("success", "Listing Deleted!");
    res.redirect("/listings");
};
