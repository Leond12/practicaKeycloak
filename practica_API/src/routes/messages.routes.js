const express = require("express");
const messagesController = require("../controllers/messages.controller");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.post("/messages", asyncHandler(messagesController.handleMessage));

module.exports = router;
