const Joi = require("joi");

module.exports.listingSchema = Joi.object({
    listing: Joi.object({
        title: Joi.string().required(),
        description: Joi.string().required(),
        location: Joi.string().required(),
        country: Joi.string().required(),
        category: Joi.string()
            .valid(
                "rooms",
                "iconic-cities",
                "mountains",
                "castles",
                "arctic",
                "camping",
                "farms",
                "domes",
                "boats"
            )
            .required(),
        price: Joi.number().required().min(0),
        image: Joi.string().allow("", null),
        amenities: Joi.object({
            kitchen: Joi.boolean(),
            wifi: Joi.boolean(),
            freeParking: Joi.boolean(),
            pool: Joi.boolean(),
            sharedSauna: Joi.boolean(),
            tv: Joi.boolean(),
            lift: Joi.boolean(),
            washingMachine: Joi.boolean(),
            dryer: Joi.boolean(),
            securityCameras: Joi.boolean(),
        }).optional(),
    }).required()
});

module.exports.reviewSchema = Joi.object({
    review: Joi.object({
        rating: Joi.number().required().min(1).max(5),
        comment: Joi.string().required(),
    }).required(),
});
