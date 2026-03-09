const Listing = require("../models/listing");
const PaymentSettings = require("../models/paymentSettings");
const { cloudinary } = require("../cloudConfig");

module.exports.renderPaymentsDashboard = async (req, res) => {
    const listings = await Listing.find({
        bookings: {
            $elemMatch: {
                paymentId: { $exists: true, $ne: "" },
            },
        },
    })
        .select("title owner bookings")
        .populate("owner", "username")
        .populate("bookings.guest", "username email");

    const paymentRows = [];

    for (const listing of listings) {
        for (const booking of listing.bookings || []) {
            if (!booking.paymentId) continue;
            paymentRows.push({
                listingId: listing._id,
                bookingId: booking._id,
                listingTitle: listing.title,
                hostUsername: listing.owner?.username || "Unknown",
                guestUsername: booking.guest?.username || "Unknown",
                guestEmail: booking.guest?.email || "",
                checkIn: booking.checkIn,
                checkOut: booking.checkOut,
                paymentMethod: booking.paymentMethod || "",
                paymentId: booking.paymentId || "",
                paymentOrderId: booking.paymentOrderId || "",
                paymentStatus: booking.paymentStatus || "created",
                paymentAmountPaise: booking.paymentAmountPaise || 0,
                adminReceived: booking.adminReceived === true,
                adminReceivedAt: booking.adminReceivedAt || null,
                adminReference: booking.adminReference || "",
                adminNote: booking.adminNote || "",
                createdAt: booking.createdAt,
            });
        }
    }

    paymentRows.sort((a, b) => {
        const aDate = new Date(a.createdAt).getTime();
        const bDate = new Date(b.createdAt).getTime();
        return bDate - aDate;
    });

    const paymentSettings = await PaymentSettings.findOne({});

    return res.render("admin/payments.ejs", { paymentRows, paymentSettings });
};

module.exports.updatePaymentDetails = async (req, res) => {
    const { listingId, bookingId } = req.params;
    const { adminReference = "", adminNote = "", adminReceived } = req.body;

    const listing = await Listing.findById(listingId);
    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/admin/payments");
    }

    const booking = (listing.bookings || []).id(bookingId);
    if (!booking || !booking.paymentId) {
        req.flash("error", "Payment record not found.");
        return res.redirect("/admin/payments");
    }

    booking.adminReference = String(adminReference).trim();
    booking.adminNote = String(adminNote).trim();

    const shouldMarkReceived = adminReceived === "true";
    booking.adminReceived = shouldMarkReceived;
    booking.adminReceivedAt = shouldMarkReceived ? new Date() : null;

    await listing.save();
    req.flash("success", "Payment details updated.");
    return res.redirect("/admin/payments");
};

module.exports.updatePaymentSettings = async (req, res) => {
    const upiId = String(req.body?.payment?.upiId || "").trim();
    const qrFile = req.file;

    let paymentSettings = await PaymentSettings.findOne({});
    if (!paymentSettings) {
        paymentSettings = new PaymentSettings({});
    }

    const hasQrAfterUpdate = Boolean(qrFile || paymentSettings.qrImage?.url);
    if (!upiId && !hasQrAfterUpdate) {
        req.flash("error", "Add a UPI ID or upload a QR image.");
        return res.redirect("/admin/payments");
    }

    paymentSettings.upiId = upiId;

    if (qrFile) {
        if (paymentSettings.qrImage?.filename) {
            try {
                await cloudinary.uploader.destroy(paymentSettings.qrImage.filename);
            } catch (err) {
                // Ignore cleanup failure and keep progressing with new image.
            }
        }

        paymentSettings.qrImage = {
            url: qrFile.path,
            filename: qrFile.filename,
        };
    }

    await paymentSettings.save();
    req.flash("success", "Payment settings updated successfully.");
    return res.redirect("/admin/payments");
};
