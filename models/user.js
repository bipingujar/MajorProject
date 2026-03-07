const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new mongoose.Schema({
  username: String,
  fullName: {
    type: String,
    trim: true,
    default: "",
  },
  dateOfBirth: Date,
  email: String,
  password: String,
  isAdmin: {
    type: Boolean,
    default: false,
  },
  wishlist: [
    {
      type: Schema.Types.ObjectId,
      ref: "Listing",
    },
  ],

  resetPasswordToken: String,
  resetPasswordExpires: Date,
  resetPasswordOtpHash: String,
  resetPasswordOtpExpires: Date
});
userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);
