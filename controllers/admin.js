const Listing = require("../models/listing");

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

    return res.render("admin/payments.ejs", { paymentRows });
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
