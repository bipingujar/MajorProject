const mongoose = require("mongoose");

const paymentSettingsSchema = new mongoose.Schema(
    {
        upiId: {
            type: String,
            trim: true,
            default: "",
        },
        qrImage: {
            url: {
                type: String,
                default: "",
            },
            filename: {
                type: String,
                default: "",
            },
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("PaymentSettings", paymentSettingsSchema);
