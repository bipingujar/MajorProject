const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review = require("./review.js");

const listingSchema = new Schema({
    title: {
        type: String,
        required: true,
    },
    description: String,
    image: {
        url: String,
        filename: String,
    },
    images: [
        {
            url: String,
            filename: String,
        },
    ],
    price: Number,
    location: String,
    country: String,
    category: {
        type: String,
        enum: [
            "rooms",
            "iconic-cities",
            "mountains",
            "castles",
            "arctic",
            "camping",
            "farms",
            "domes",
            "boats",
        ],
        required: true,
        default: "rooms",
    },
    amenities: {
        kitchen: { type: Boolean, default: false },
        wifi: { type: Boolean, default: false },
        freeParking: { type: Boolean, default: false },
        pool: { type: Boolean, default: false },
        sharedSauna: { type: Boolean, default: false },
        tv: { type: Boolean, default: false },
        lift: { type: Boolean, default: false },
        washingMachine: { type: Boolean, default: false },
        dryer: { type: Boolean, default: false },
        securityCameras: { type: Boolean, default: false },
    },
    reviews: [
        {
            type: Schema.Types.ObjectId,
            ref: "Review",
        },
    ],
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    geometry: {
    type: {
      type: String, // Don't do `{ location: { type: String } }`
      enum: ['Point'], // 'location.type' must be 'Point'
      required: true
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
    bookings: [
        {
            guest: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
            checkIn: {
                type: Date,
                required: true,
            },
            checkOut: {
                type: Date,
                required: true,
            },
            guests: {
                type: Number,
                min: 1,
                default: 1,
            },
            paymentMethod: {
                type: String,
                enum: ["upi", "card", "netbanking", "wallet"],
                default: "upi",
            },
            paymentOrderId: {
                type: String,
            },
            paymentId: {
                type: String,
            },
            paymentAmountPaise: {
                type: Number,
                min: 0,
                default: 0,
            },
            paymentStatus: {
                type: String,
                enum: ["created", "authorized", "captured", "failed"],
                default: "created",
            },
            adminReceived: {
                type: Boolean,
                default: false,
            },
            adminReceivedAt: {
                type: Date,
            },
            adminReference: {
                type: String,
                trim: true,
                default: "",
            },
            adminNote: {
                type: String,
                trim: true,
                default: "",
            },
            createdAt: {
                type: Date,
                default: Date.now,
            },
        },
    ],
});

listingSchema.post("findOneAndDelete", async (listing) => {
    if (listing) {
        await Review.deleteMany({ _id: { $in: listing.reviews } });
    }
});

const listing = mongoose.model("Listing", listingSchema);
module.exports = listing;
