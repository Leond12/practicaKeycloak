const express = require("express");
const whatsappController = require("../controllers/whatsapp.controller");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.get("/webhook/whatsapp", asyncHandler(whatsappController.verifyWebhook));
router.post("/webhook/whatsapp", asyncHandler(whatsappController.receiveWebhook));

module.exports = router;
